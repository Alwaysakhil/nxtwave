# PocketPlan

PocketPlan is a small personal-finance learning project. Add income and expenses, set monthly category budgets, use the dark appearance, and ask Gemini for suggestions based on your monthly spending summary.

> This is a single-user demo, not financial advice or a production banking app. Use fictional data only. It has no sign-in, user isolation, or bank connection.

## Stack

- React and Vite for the browser app.
- Node.js and Express for the API and finance calculations.
- MySQL for transactions and budgets.
- Google Gemini for optional AI-generated spending suggestions.

The Node API calculates monthly totals and category spending. The browser calls only this API; it never connects directly to MySQL or Gemini.

## Run on Windows

1. Install Node.js 20+ and MySQL Server 8.4.
2. Copy `.env.example` to `.env`, set both MySQL passwords to 16–128 letters and numbers, and add a Gemini API key from <https://aistudio.google.com/apikey>.
3. Double-click `setup-local.bat` once to install the project dependencies, create the local database, and run the tests.
4. Double-click `run-local.bat`, then open <http://localhost:5173>.
5. Add a transaction from the dashboard. Open **Insights** to get Gemini suggestions or ask a question about your monthly spending and budgets.
6. Double-click `stop-local.bat` when you're done.

The app and local MySQL data stay on your computer. Service logs and database files are stored under `%LOCALAPPDATA%\PocketPlan`. Never commit `.env`.

### AI data and setup

The Gemini key is read by the Node API from `GEMINI_API_KEY`; it is not sent to the browser. Each time you ask Gemini, the API sends Gemini 3.5 Flash the selected month, income and expense totals, category totals, previous-month category totals, budget limits, and your question if you entered one. It does **not** send transaction descriptions or notes. Gemini answers are generated text and may be wrong; review them rather than treating them as financial advice.

If AI is not configured, the Insights page explains that `GEMINI_API_KEY` must be set in `.env`. Restart the app after changing `.env`.

## How it works

1. React sends a transaction or budget request to Express.
2. Express validates the request and uses parameterized MySQL queries to save or read data.
3. Express builds the selected month's totals, category spending, and budget usage.
4. When asked, Express sends monthly aggregates and an optional user question to Gemini and returns its answer to React.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check the API and MySQL |
| `GET` | `/api/dashboard?month=YYYY-MM` | Monthly totals, category spending, and budgets |
| `GET` | `/api/transactions?month=YYYY-MM` | List transactions |
| `POST` | `/api/transactions` | Add a transaction |
| `DELETE` | `/api/transactions/{id}` | Delete a transaction |
| `GET` | `/api/budgets?month=YYYY-MM` | List budgets |
| `PUT` | `/api/budgets?month=YYYY-MM` | Save a category budget |
| `POST` | `/api/insights?month=YYYY-MM` | Get suggestions or answer a question (optional JSON body: `{"question":"..."}`) |

Amounts are positive INR values; transaction type determines income or expense. Notes are optional.

## Tests

- In `frontend/`: `npm test` and `npm run build`
- In `api/`: `npm test`

## Code map

- `frontend/src/App.jsx`: page state, actions, and screen layout
- `frontend/src/components.jsx`: reusable dashboard and list components
- `frontend/src/api.js`: API calls and currency/date formatting
- `api/src/app.js`: HTTP routes and financial data flow
- `api/src/gemini.js`: Gemini prompt and API integration
- `api/src/validation.js`: request validation
- `api/src/server.js`: database connection and API startup
- `database/schema.sql`: MySQL tables and constraints

## Explaining the project

Practice explaining the parts you have run and understand: the browser → Express → MySQL request flow, why SQL queries use parameters, how budgets compare to category spending, and what summary data Gemini receives. Be clear that Gemini generates suggestions from aggregates and the app is a single-user demo. You can also describe what you used AI assistance for honestly.
