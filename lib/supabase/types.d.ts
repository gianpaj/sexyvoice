interface UserProfile {
  id: string;
  linkedin_url: string | null;
  full_name: string | null;
  headline: string | null;
  industry: string | null;
  location: string | null;
  profile_picture_url: string | null;
  created_at: string;
  updated_at: string;
}

interface CreditTransaction {
  id: string; // UUID
  user_id: string; // UUID
  amount: number;
  type: 'purchase' | 'usage';
  description: string;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}
