CREATE TRIGGER new_user_trigger AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
