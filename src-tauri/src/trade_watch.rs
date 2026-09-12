use std::collections::HashSet;

use chrono::{SecondsFormat, Utc};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::SharedConnection,
    domain_resource::DomainResourceService,
    error::AppError,
    market_quote::{MarketQuote, MarketQuoteService},
};

const RESOURCE: &str = "trade.watchlist";
const COMMAND: &str = "add_trade_watch";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddTradeWatchInput {
    pub request_id: String,
    pub code: String,
    pub name: String,
    pub optimistic_target: f64,
    pub target: f64,
    pub pessimistic_target: f64,
    #[serde(default)]
    pub tags: Vec<String>,
    pub business_model_rating: Option<u8>,
    pub profitability_rating: Option<u8>,
    pub financial_stability_rating: Option<u8>,
    pub cash_flow_rating: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TradeWatch {
    pub id: String,
    pub code: String,
    pub name: String,
    pub optimistic_target: f64,
    pub target: f64,
    pub pessimistic_target: f64,
    pub safety: f64,
    pub current: f64,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub business_model_rating: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profitability_rating: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub financial_stability_rating: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cash_flow_rating: Option<u8>,
    pub quote_at: String,
    pub created_at: String,
}

pub struct TradeWatchService {
    connection: SharedConnection,
    quotes: MarketQuoteService,
}

impl TradeWatchService {
    /// Creates the trade watch service. Side effects: none beyond retaining shared adapters.
    pub fn new(connection: SharedConnection, quotes: MarketQuoteService) -> Self {
        Self { connection, quotes }
    }

    /// Adds one validated watch entity. Side effects: may migrate the legacy resource, performs one
    /// fixed-host quote request, then appends the entity and idempotency receipt atomically.
    pub async fn add_watch(&self, input: AddTradeWatchInput) -> Result<TradeWatch, AppError> {
        let normalized = validate(input)?;
        DomainResourceService::new(self.connection.clone()).load(RESOURCE)?;
        if let Some(existing) = self.find_receipt(&normalized.request_id)? {
            return Ok(existing);
        }
        let quote = self
            .quotes
            .fetch(std::slice::from_ref(&normalized.code))
            .await?
            .into_iter()
            .next()
            .ok_or(AppError::ExternalService)?;
        self.append_with_quote(normalized, quote)
    }

    fn find_receipt(&self, request_id: &str) -> Result<Option<TradeWatch>, AppError> {
        let connection = self.connection.lock().map_err(|_| AppError::Conflict)?;
        let receipt = connection
            .query_row(
                "SELECT command,result_id FROM command_receipt WHERE request_id=?1",
                [request_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional()?;
        match receipt {
            None => Ok(None),
            Some((command, Some(result_id))) if command == COMMAND => {
                read_watch(&connection, &result_id).map(Some)
            }
            Some((command, _)) if command == COMMAND => {
                Err(AppError::ConflictMessage("幂等收据缺少观察标的结果".into()))
            }
            Some(_) => Err(AppError::ConflictMessage(
                "该 requestId 已用于其他命令".into(),
            )),
        }
    }

    fn append_with_quote(
        &self,
        input: AddTradeWatchInput,
        quote: MarketQuote,
    ) -> Result<TradeWatch, AppError> {
        let mut connection = self.connection.lock().map_err(|_| AppError::Conflict)?;
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let receipt = transaction
            .query_row(
                "SELECT command,result_id FROM command_receipt WHERE request_id=?1",
                [&input.request_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional()?;
        if let Some((command, result_id)) = receipt {
            if command != COMMAND {
                return Err(AppError::ConflictMessage(
                    "该 requestId 已用于其他命令".into(),
                ));
            }
            let result_id = result_id
                .ok_or_else(|| AppError::ConflictMessage("幂等收据缺少观察标的结果".into()))?;
            let existing = read_watch(&transaction, &result_id)?;
            transaction.commit()?;
            return Ok(existing);
        }

        let duplicate = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM domain_entity WHERE resource=?1 AND json_extract(value_json,'$.code')=?2)",
            params![RESOURCE, input.code],
            |row| row.get::<_, bool>(0),
        )?;
        if duplicate {
            return Err(AppError::ConflictMessage("该代码已在观察列表".into()));
        }

        let watch = TradeWatch {
            id: Uuid::new_v4().to_string(),
            code: input.code,
            name: input.name,
            optimistic_target: input.optimistic_target,
            target: input.target,
            pessimistic_target: input.pessimistic_target,
            safety: 0.0,
            current: quote.price,
            tags: input.tags,
            business_model_rating: input.business_model_rating,
            profitability_rating: input.profitability_rating,
            financial_stability_rating: input.financial_stability_rating,
            cash_flow_rating: input.cash_flow_rating,
            quote_at: quote.quote_at,
            created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        };
        let position = transaction.query_row(
            "SELECT COALESCE(MAX(position),-1)+1 FROM domain_entity WHERE resource=?1",
            [RESOURCE],
            |row| row.get::<_, i64>(0),
        )?;
        transaction.execute("DELETE FROM domain_value WHERE resource=?1", [RESOURCE])?;
        transaction.execute(
            "INSERT INTO domain_entity(resource,entity_id,position,value_json,created_at,updated_at) VALUES (?1,?2,?3,?4,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
            params![RESOURCE, watch.id, position, serde_json::to_string(&watch).map_err(|_| AppError::Validation)?],
        )?;
        transaction.execute(
            "INSERT OR IGNORE INTO domain_resource_migration(resource,migrated_at) VALUES (?1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
            [RESOURCE],
        )?;
        transaction.execute(
            "INSERT INTO command_receipt(request_id,command,result_id,created_at) VALUES (?1,?2,?3,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
            params![input.request_id, COMMAND, watch.id],
        )?;
        transaction.commit()?;
        Ok(watch)
    }
}

fn validate(mut input: AddTradeWatchInput) -> Result<AddTradeWatchInput, AppError> {
    if Uuid::parse_str(&input.request_id).is_err() {
        return Err(AppError::ValidationMessage("requestId 必须是 UUID".into()));
    }
    input.code = input.code.trim().to_owned();
    input.name = input.name.trim().to_owned();
    if input.code.len() != 6 || !input.code.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(AppError::ValidationMessage("股票代码必须是六位数字".into()));
    }
    if input.name.is_empty() || input.name.chars().count() > 100 {
        return Err(AppError::ValidationMessage(
            "股票名称应为 1–100 个字符".into(),
        ));
    }
    if ![
        input.optimistic_target,
        input.target,
        input.pessimistic_target,
    ]
    .into_iter()
    .all(|value| value.is_finite() && value > 0.0)
        || input.optimistic_target < input.target
        || input.target < input.pessimistic_target
    {
        return Err(AppError::ValidationMessage(
            "目标价必须满足乐观 ≥ 中枢 ≥ 悲观 > 0".into(),
        ));
    }
    if input.tags.len() > 10 {
        return Err(AppError::ValidationMessage("标签最多 10 个".into()));
    }
    let mut seen = HashSet::new();
    let mut tags = Vec::new();
    for tag in input.tags {
        let tag = tag.trim().to_owned();
        if tag.is_empty() || tag.chars().count() > 20 {
            return Err(AppError::ValidationMessage(
                "每个标签应为 1–20 个字符".into(),
            ));
        }
        if seen.insert(tag.clone()) {
            tags.push(tag);
        }
    }
    input.tags = tags;
    if [
        input.business_model_rating,
        input.profitability_rating,
        input.financial_stability_rating,
        input.cash_flow_rating,
    ]
    .into_iter()
    .flatten()
    .any(|rating| rating > 5)
    {
        return Err(AppError::ValidationMessage(
            "四项评分均应为 0–5 的整数或留空".into(),
        ));
    }
    Ok(input)
}

fn read_watch(connection: &rusqlite::Connection, id: &str) -> Result<TradeWatch, AppError> {
    let raw = connection
        .query_row(
            "SELECT value_json FROM domain_entity WHERE resource=?1 AND entity_id=?2",
            params![RESOURCE, id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| AppError::ConflictMessage("幂等结果已不存在".into()))?;
    serde_json::from_str(&raw).map_err(|_| AppError::Validation)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn input(request_id: &str) -> AddTradeWatchInput {
        AddTradeWatchInput {
            request_id: request_id.into(),
            code: "600519".into(),
            name: " 贵州茅台 ".into(),
            optimistic_target: 1800.0,
            target: 1680.0,
            pessimistic_target: 1550.0,
            tags: vec!["消费".into(), " 消费 ".into()],
            business_model_rating: Some(5),
            profitability_rating: None,
            financial_stability_rating: Some(4),
            cash_flow_rating: Some(5),
        }
    }

    #[test]
    fn validates_and_normalizes_agent_input() {
        let normalized = validate(input("018fb47d-4dc7-7e9a-8a6f-5df4f34c6910")).unwrap();
        assert_eq!(normalized.name, "贵州茅台");
        assert_eq!(normalized.tags, vec!["消费"]);
        let mut invalid = input("not-a-uuid");
        assert!(validate(invalid.clone()).is_err());
        invalid.request_id = "018fb47d-4dc7-7e9a-8a6f-5df4f34c6910".into();
        invalid.optimistic_target = 100.0;
        assert!(validate(invalid).is_err());
    }

    #[test]
    fn appends_once_and_returns_the_receipted_entity() {
        let connection = db::open_shared(std::path::Path::new(":memory:")).unwrap();
        DomainResourceService::new(connection.clone())
            .load(RESOURCE)
            .unwrap();
        let service =
            TradeWatchService::new(connection.clone(), MarketQuoteService::new().unwrap());
        let request_id = "018fb47d-4dc7-7e9a-8a6f-5df4f34c6910";
        let quote = MarketQuote {
            code: "600519".into(),
            price: 1309.22,
            quote_at: "2026-08-30T15:00:00".into(),
        };
        let first = service
            .append_with_quote(validate(input(request_id)).unwrap(), quote.clone())
            .unwrap();
        let second = service
            .append_with_quote(validate(input(request_id)).unwrap(), quote)
            .unwrap();
        assert_eq!(first, second);
        assert_eq!(
            DomainResourceService::new(connection)
                .load(RESOURCE)
                .unwrap()
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn rejects_duplicate_code_without_a_second_entity() {
        let connection = db::open_shared(std::path::Path::new(":memory:")).unwrap();
        DomainResourceService::new(connection.clone())
            .load(RESOURCE)
            .unwrap();
        let service =
            TradeWatchService::new(connection.clone(), MarketQuoteService::new().unwrap());
        let quote = MarketQuote {
            code: "600519".into(),
            price: 1309.22,
            quote_at: "2026-08-30T15:00:00".into(),
        };
        service
            .append_with_quote(
                validate(input("018fb47d-4dc7-7e9a-8a6f-5df4f34c6910")).unwrap(),
                quote.clone(),
            )
            .unwrap();
        assert!(matches!(
            service.append_with_quote(
                validate(input("018fb47d-4dc7-7e9a-8a6f-5df4f34c6911")).unwrap(),
                quote
            ),
            Err(AppError::ConflictMessage(_))
        ));
    }
}
