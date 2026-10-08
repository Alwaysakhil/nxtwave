CREATE TABLE IF NOT EXISTS finance_transactions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    description VARCHAR(120) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    type VARCHAR(10) NOT NULL,
    category VARCHAR(60) NOT NULL,
    occurred_on DATE NOT NULL,
    notes VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_transaction_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_transaction_type CHECK (type IN ('INCOME', 'EXPENSE')),
    INDEX idx_transactions_occurred_on (occurred_on),
    INDEX idx_transactions_category_date (category, occurred_on)
);

CREATE TABLE IF NOT EXISTS monthly_budgets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    category VARCHAR(60) NOT NULL,
    budget_year SMALLINT NOT NULL,
    budget_month TINYINT NOT NULL,
    monthly_limit DECIMAL(12, 2) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_budget_category_month UNIQUE (category, budget_year, budget_month),
    CONSTRAINT chk_budget_limit_positive CHECK (monthly_limit > 0),
    CONSTRAINT chk_budget_month CHECK (budget_month BETWEEN 1 AND 12)
);
