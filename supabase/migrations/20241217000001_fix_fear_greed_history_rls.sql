-- Fix RLS policies for fear_greed_history table
-- The service_role policy doesn't work with the anon client used by API routes

-- Drop the service_role policy
DROP POLICY IF EXISTS "Allow service role to insert fear_greed_history" ON fear_greed_history;

-- Add policies for anon and authenticated roles
CREATE POLICY "Allow anon to insert fear_greed_history"
  ON fear_greed_history
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to insert fear_greed_history"
  ON fear_greed_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
