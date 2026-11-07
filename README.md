# State Farm Real-Time Catastrophe Response Platform

Built for the hackathon using **Next.js**, **TypeScript**, **Tailwind CSS**, **SpacetimeDB** (TypeScript SDK), and **NVIDIA Nemotron** (via OpenAI-compatible NIM API with tool calling).

## Monorepo Layout

- **/spacetimedb**: A SpacetimeDB server module with 4 public tables (`customer`, `policy`, `claim`, `interaction_log`) and reducers to seed 10 diverse catastrophe-affected customers, insert chat/voice messages, update customer priority scores/reasons/recommended actions, and auto-file claims.
- **/web**: A Next.js frontend with a Split-Screen Demo Mode (Customer Mobile App on the left, State Farm Agent Triage Dashboard on the right) connected in real time via SpacetimeDB subscriptions. Includes a Web Speech API voice call simulator supporting English (`en-US`) and Spanish (`es-MX`), and an API route `/api/nemotron-agent` that runs a multi-step tool-calling workflow (`assess_risk_and_update_score`, `auto_file_claim`, `trigger_emergency_contact`).

