use std::time::Duration;

use reqwest::{Client, redirect::Policy};
use serde::Serialize;

use crate::error::AppError;

const ENDPOINT: &str = "https://hq.sinajs.cn/list=";
const MAX_CODES: usize = 50;
const MAX_RESPONSE_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketQuote {
    pub code: String,
    pub price: f64,
    pub quote_at: String,
}

pub struct MarketQuoteService {
    client: Client,
}

impl MarketQuoteService {
    /// Creates the fixed-host Sina quote adapter. Side effects: allocates an HTTP client only.
    pub fn new() -> Result<Self, reqwest::Error> {
        let client = Client::builder()
            .timeout(Duration::from_secs(8))
            .redirect(Policy::none())
            .no_proxy()
            .user_agent("Life-OS/0.1 market-discipline-check")
            .build()?;
        Ok(Self { client })
    }

    /// Fetches current A-share snapshots. Side effects: sends one HTTPS GET to the fixed Sina
    /// endpoint and reads at most 64 KiB; never writes storage or follows redirects.
    pub async fn fetch(&self, codes: &[String]) -> Result<Vec<MarketQuote>, AppError> {
        let symbols = validate_and_map_codes(codes)?;
        let response = self
            .client
            .get(format!("{ENDPOINT}{}", symbols.join(",")))
            .header("Referer", "https://finance.sina.com.cn/")
            .send()
            .await
            .map_err(|_| AppError::ExternalService)?;
        if !response.status().is_success() || response.content_length().is_some_and(|size| size as usize > MAX_RESPONSE_BYTES) {
            return Err(AppError::ExternalService);
        }
        let bytes = response.bytes().await.map_err(|_| AppError::ExternalService)?;
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(AppError::ExternalService);
        }
        parse_response(&String::from_utf8_lossy(&bytes), codes)
    }
}

fn validate_and_map_codes(codes: &[String]) -> Result<Vec<String>, AppError> {
    if codes.is_empty() || codes.len() > MAX_CODES {
        return Err(AppError::Validation);
    }
    let mut unique = std::collections::HashSet::new();
    codes
        .iter()
        .map(|code| {
            if code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_digit()) || !unique.insert(code) {
                return Err(AppError::Validation);
            }
            let prefix = if code.starts_with("920") || matches!(code.as_bytes()[0], b'4' | b'8') {
                "bj"
            } else if matches!(code.as_bytes()[0], b'5' | b'6' | b'9') {
                "sh"
            } else if matches!(code.as_bytes()[0], b'0' | b'1' | b'2' | b'3') {
                "sz"
            } else {
                return Err(AppError::Validation);
            };
            Ok(format!("{prefix}{code}"))
        })
        .collect()
}

fn parse_response(body: &str, requested_codes: &[String]) -> Result<Vec<MarketQuote>, AppError> {
    let mut quotes = Vec::new();
    for line in body.lines().filter(|line| !line.trim().is_empty()) {
        let symbol = line.strip_prefix("var hq_str_").and_then(|value| value.split_once('=').map(|item| item.0)).ok_or(AppError::ExternalService)?;
        let code = symbol.get(2..).ok_or(AppError::ExternalService)?;
        if !requested_codes.iter().any(|requested| requested == code) {
            return Err(AppError::ExternalService);
        }
        let payload = line.split_once("=\"").and_then(|item| item.1.strip_suffix("\";")).ok_or(AppError::ExternalService)?;
        let fields: Vec<&str> = payload.split(',').collect();
        if fields.len() < 32 {
            return Err(AppError::ExternalService);
        }
        let price = fields[3].parse::<f64>().map_err(|_| AppError::ExternalService)?;
        if !price.is_finite() || price <= 0.0 || !valid_date(fields[30]) || !valid_time(fields[31]) {
            return Err(AppError::ExternalService);
        }
        quotes.push(MarketQuote { code: code.to_owned(), price, quote_at: format!("{}T{}", fields[30], fields[31]) });
    }
    if quotes.len() != requested_codes.len() {
        return Err(AppError::ExternalService);
    }
    Ok(quotes)
}

fn valid_date(value: &str) -> bool {
    value.len() == 10
        && value.bytes().enumerate().all(|(index, byte)| matches!(index, 4 | 7) && byte == b'-' || !matches!(index, 4 | 7) && byte.is_ascii_digit())
        && value[5..7].parse::<u8>().is_ok_and(|month| (1..=12).contains(&month))
        && value[8..10].parse::<u8>().is_ok_and(|day| (1..=31).contains(&day))
}

fn valid_time(value: &str) -> bool {
    value.len() == 8
        && value.bytes().enumerate().all(|(index, byte)| matches!(index, 2 | 5) && byte == b':' || !matches!(index, 2 | 5) && byte.is_ascii_digit())
        && value[0..2].parse::<u8>().is_ok_and(|hour| hour < 24)
        && value[3..5].parse::<u8>().is_ok_and(|minute| minute < 60)
        && value[6..8].parse::<u8>().is_ok_and(|second| second < 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_supported_a_share_codes_and_rejects_untrusted_input() {
        assert_eq!(validate_and_map_codes(&["600519".into(), "002230".into(), "920001".into()]).unwrap(), vec!["sh600519", "sz002230", "bj920001"]);
        assert!(matches!(validate_and_map_codes(&["600519".into(), "600519".into()]), Err(AppError::Validation)));
        assert!(matches!(validate_and_map_codes(&["AAPL".into()]), Err(AppError::Validation)));
    }

    #[test]
    fn parses_price_and_quote_time_without_trusting_the_gbk_name() {
        let body = "var hq_str_sh600519=\"name,1308.660,1308.550,1309.220,1315.280,1301.000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-08-07,15:34:59,00\";";
        assert_eq!(parse_response(body, &["600519".into()]).unwrap(), vec![MarketQuote { code: "600519".into(), price: 1309.22, quote_at: "2026-08-07T15:34:59".into() }]);
        assert!(parse_response("var hq_str_sh600519=\"\";", &["600519".into()]).is_err());
    }
}
