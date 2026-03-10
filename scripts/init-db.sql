-- AALA.LAND - Database initialization
-- Runs once on first container start
-- Creates both dev and test databases

SELECT 'CREATE DATABASE aala_land'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aala_land')\gexec

SELECT 'CREATE DATABASE aala_land_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aala_land_test')\gexec
