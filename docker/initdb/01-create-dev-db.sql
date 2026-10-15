-- Runs once, when the PostgreSQL volume is created (docker-compose.yaml).
-- saveme (real data) is created by POSTGRES_DB; this adds the experiments one.
CREATE DATABASE saveme_dev OWNER saveme;
