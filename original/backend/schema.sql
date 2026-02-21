-- ClawDeploy Database Schema
-- PostgreSQL (Neon)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- Table: instances
-- ========================================
-- Stores OpenClaw instance information
CREATE TABLE IF NOT EXISTS instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  model VARCHAR(50) NOT NULL CHECK (model IN ('claude-opus-4.5', 'gpt-5.2', 'gemini-3-flash')),
  channel VARCHAR(50) NOT NULL CHECK (channel IN ('telegram', 'discord', 'whatsapp')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'stopped', 'error', 'deleted')),
  container_id VARCHAR(255),
  bot_token TEXT,
  api_key TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for instances table
CREATE INDEX IF NOT EXISTS idx_instances_user_id ON instances(user_id);
CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
CREATE INDEX IF NOT EXISTS idx_instances_created_at ON instances(created_at DESC);

-- ========================================
-- Table: usage_logs
-- ========================================
-- Stores instance usage events for monitoring and billing
CREATE TABLE IF NOT EXISTS usage_logs (
  id BIGSERIAL PRIMARY KEY,
  instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('start', 'stop', 'restart', 'delete', 'api_call', 'error')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for usage_logs table
CREATE INDEX IF NOT EXISTS idx_usage_logs_instance_id ON usage_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_event_type ON usage_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at DESC);

-- ========================================
-- Function: Update updated_at timestamp
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for instances table
DROP TRIGGER IF EXISTS update_instances_updated_at ON instances;
CREATE TRIGGER update_instances_updated_at
  BEFORE UPDATE ON instances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Sample Data (for development only)
-- ========================================
-- Uncomment the following to insert sample data

-- INSERT INTO instances (user_id, name, model, channel, status, container_id)
-- VALUES 
--   ('user_sample_123', 'My First Instance', 'claude-opus-4.5', 'telegram', 'running', 'container_abc123'),
--   ('user_sample_123', 'Test Instance', 'gpt-5.2', 'discord', 'stopped', 'container_def456');

-- INSERT INTO usage_logs (instance_id, event_type, metadata)
-- SELECT id, 'start', '{"source": "api"}'::jsonb FROM instances LIMIT 1;

-- ========================================
-- Verification Queries
-- ========================================
-- Run these to verify the schema is correct

-- List all tables
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Count instances
-- SELECT COUNT(*) FROM instances;

-- Check instance statuses
-- SELECT status, COUNT(*) FROM instances GROUP BY status;
