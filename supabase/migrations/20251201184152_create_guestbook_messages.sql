-- Create guestbook_messages table
CREATE TABLE guestbook_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE guestbook_messages ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read messages
CREATE POLICY "Anyone can read messages" ON guestbook_messages
  FOR SELECT USING (true);

-- Allow anyone to insert messages  
CREATE POLICY "Anyone can insert messages" ON guestbook_messages
  FOR INSERT WITH CHECK (true);

-- Index for faster sorting by date
CREATE INDEX idx_guestbook_messages_created_at ON guestbook_messages(created_at);

