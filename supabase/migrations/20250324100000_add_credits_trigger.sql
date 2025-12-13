-- Migration: Add credits trigger for new users
-- This runs after the credit_transactions table is created

-- Create function to add initial credits when new user is created
CREATE OR REPLACE FUNCTION add_credits_on_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert 10000 credits into credit_transactions for the user_id
    INSERT INTO credit_transactions (user_id, amount, type, description)
    VALUES (NEW.id, 10000, 'freemium', 'Initial signup credits');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Create trigger to automatically add credits for new users
CREATE TRIGGER add_credits_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION add_credits_on_event();
