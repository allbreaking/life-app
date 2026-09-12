/// Starts the bundled MCP stdio sidecar. Side effects are documented by agent_mcp::run.
fn main() {
    if let Err(error) = life_os_lib::run_agent_mcp() {
        eprintln!("Life-OS MCP stopped: {error}");
        std::process::exit(1);
    }
}
