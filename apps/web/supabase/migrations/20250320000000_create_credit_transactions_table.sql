-- Create enum for transaction types
create type credit_transaction_type as enum ('purchase', 'usage');
-- Create credit_transactions table
create table credit_transactions (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) not null,
    amount integer not null,
    type credit_transaction_type not null,
    description text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Add RLS policies
alter table credit_transactions enable row level security;
-- Users can only read their own transactions
create policy "Users can view own credit transactions"
    on credit_transactions for select
    using (auth.uid() = user_id);
-- Only service role can insert transactions
-- create policy "Service role can insert credit transactions"
--     on credit_transactions for insert
--     using (auth.role() = 'service_role');

-- Create updated_at trigger
-- create trigger handle_updated_at before update on credit_transactions
--     for each row execute procedure moddatetime (updated_at);

-- Create indexes
create index credit_transactions_user_id_idx on credit_transactions(user_id);
create index credit_transactions_created_at_idx on credit_transactions(created_at);
