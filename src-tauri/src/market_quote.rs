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

#[derive(Clone)]
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
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|size| size as usize > MAX_RESPONSE_BYTES)
        {
            return Err(AppError::ExternalService);
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|_| AppError::ExternalService)?;
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
            if !code.bytes().all(|byte| byte.is_ascii_digit()) || !unique.insert(code) {
                return Err(AppError::Validation);
            }
            match code.len() {
                6 => {
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
                }
                5 => Ok(format!("hk{code}")),
                _ => Err(AppError::Validation),
            }
        })
        .collect()
}

fn parse_response(body: &str, requested_codes: &[String]) -> Result<Vec<MarketQuote>, AppError> {
    let mut quotes = Vec::new();
    for line in body.lines().filter(|line| !line.trim().is_empty()) {
        let Some(symbol) = line
            .strip_prefix("var hq_str_")
            .and_then(|value| value.split_once('=').map(|item| item.0))
        else {
            continue;
        };
        let Some(code) = symbol.get(2..) else {
            continue;
        };
        if !requested_codes.iter().any(|requested| requested == code) {
            continue;
        }
        let Some(payload) = line
            .split_once("=\"")
            .and_then(|item| item.1.strip_suffix("\";"))
        else {
            continue;
        };
        let quote = if symbol.starts_with("hk") {
            parse_hk_quote(payload, code)
        } else {
            parse_a_share_quote(payload, code)
        };
        if let Some(quote) = quote {
            quotes.push(quote);
        }
    }
    Ok(quotes)
}

/// Parses a mainland A-share snapshot (fields[3]=price, fields[30]=date, fields[31]=time).
/// Returns None for a halted or malformed line so one bad instrument never fails the whole batch.
fn parse_a_share_quote(payload: &str, code: &str) -> Option<MarketQuote> {
    let fields: Vec<&str> = payload.split(',').collect();
    if fields.len() < 32 {
        return None;
    }
    let price = fields[3].parse::<f64>().ok()?;
    if !price.is_finite() || price <= 0.0 || !valid_date(fields[30]) || !valid_time(fields[31]) {
        return None;
    }
    Some(MarketQuote {
        code: code.to_owned(),
        price,
        quote_at: format!("{}T{}", fields[30], fields[31]),
    })
}

/// Parses a Hong Kong snapshot (fields[6]=price, fields[17]=slash date, fields[18]=HH:MM time).
/// Returns None for a halted or malformed line.
fn parse_hk_quote(payload: &str, code: &str) -> Option<MarketQuote> {
    let fields: Vec<&str> = payload.split(',').collect();
    if fields.len() < 19 {
        return None;
    }
    let price = fields[6].parse::<f64>().ok()?;
    if !price.is_finite() || price <= 0.0 {
        return None;
    }
    let date = fields[17].replace('/', "-");
    if !valid_date(&date) {
        return None;
    }
    let time = if fields[18].len() == 5 {
        format!("{}:00", fields[18])
    } else {
        fields[18].to_owned()
    };
    if !valid_time(&time) {
        return None;
    }
    Some(MarketQuote {
        code: code.to_owned(),
        price,
        quote_at: format!("{date}T{time}"),
    })
}

fn valid_date(value: &str) -> bool {
    value.len() == 10
        && value.bytes().enumerate().all(|(index, byte)| {
            matches!(index, 4 | 7) && byte == b'-'
                || !matches!(index, 4 | 7) && byte.is_ascii_digit()
        })
        && value[5..7]
            .parse::<u8>()
            .is_ok_and(|month| (1..=12).contains(&month))
        && value[8..10]
            .parse::<u8>()
            .is_ok_and(|day| (1..=31).contains(&day))
}

fn valid_time(value: &str) -> bool {
    value.len() == 8
        && value.bytes().enumerate().all(|(index, byte)| {
            matches!(index, 2 | 5) && byte == b':'
                || !matches!(index, 2 | 5) && byte.is_ascii_digit()
        })
        && value[0..2].parse::<u8>().is_ok_and(|hour| hour < 24)
        && value[3..5].parse::<u8>().is_ok_and(|minute| minute < 60)
        && value[6..8].parse::<u8>().is_ok_and(|second| second < 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_supported_a_share_codes_and_rejects_untrusted_input() {
        assert_eq!(
            validate_and_map_codes(&["600519".into(), "002230".into(), "920001".into()]).unwrap(),
            vec!["sh600519", "sz002230", "bj920001"]
        );
        assert_eq!(
            validate_and_map_codes(&["00700".into(), "09988".into()]).unwrap(),
            vec!["hk00700", "hk09988"]
        );
        assert!(matches!(
            validate_and_map_codes(&["600519".into(), "600519".into()]),
            Err(AppError::Validation)
        ));
        assert!(matches!(
            validate_and_map_codes(&["AAPL".into()]),
            Err(AppError::Validation)
        ));
        assert!(matches!(
            validate_and_map_codes(&["1234".into()]),
            Err(AppError::Validation)
        ));
    }

    #[test]
    fn parses_price_and_quote_time_without_trusting_the_gbk_name() {
        let body = "var hq_str_sh600519=\"name,1308.660,1308.550,1309.220,1315.280,1301.000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-08-07,15:34:59,00\";";
        assert_eq!(
            parse_response(body, &["600519".into()]).unwrap(),
            vec![MarketQuote {
                code: "600519".into(),
                price: 1309.22,
                quote_at: "2026-08-07T15:34:59".into()
            }]
        );
        assert!(parse_response("var hq_str_sh600519=\"\";", &["600519".into()])
            .unwrap()
            .is_empty());
    }

    #[test]
    fn parses_hong_kong_snapshot_with_slash_date_and_short_time() {
        let body = "var hq_str_hk00700=\"TENCENT,腾讯控股,419.400,425.600,430.800,419.400,428.400,2.800,0.658,428.39999,428.79999,6674835081,15628379,0.000,0.000,675.134,411.000,2026/09/11,16:09\";";
        assert_eq!(
            parse_response(body, &["00700".into()]).unwrap(),
            vec![MarketQuote {
                code: "00700".into(),
                price: 428.4,
                quote_at: "2026-09-11T16:09:00".into()
            }]
        );
    }

    #[test]
    fn skips_halted_instruments_instead_of_failing_the_batch() {
        let body = concat!(
            "var hq_str_sh600519=\"name,1308.660,1308.550,1309.220,1315.280,1301.000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-08-07,15:34:59,00\";\n",
            "var hq_str_sz000001=\"name,0.000,0.000,0.000,0.000,0.000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-08-07,15:00:00,00\";"
        );
        let quotes = parse_response(body, &["600519".into(), "000001".into()]).unwrap();
        assert_eq!(quotes.len(), 1);
        assert_eq!(quotes[0].code, "600519");
        assert_eq!(quotes[0].price, 1309.22);
    }
}
