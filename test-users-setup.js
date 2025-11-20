// test-users-setup.js
// Run after creating users in Supabase Auth dashboard
// Install: npm install @supabase/supabase-js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'REPLACE_WITH_SUPABASE_URL';
// Replace with your anon key (do NOT expose service_role in client-side code)
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'REPLACE_WITH_ANON_KEY';

if (supabaseKey === 'REPLACE_WITH_ANON_KEY') {
  console.error('ERROR: Replace the supabaseKey or set SUPABASE_ANON_KEY env var.');
  process.exit(1);
}

// Top-level (anon) client used for sign-in
const supabase = createClient(supabaseUrl, supabaseKey, {
  // optional: configure global headers or fetch
});

async function testUserCreation() {
  console.log('Testing database access with anon client (should fail for RLS-protected tables)...');

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .limit(1);

    if (error) {
      console.warn('Database read with anon client returned error (expected if RLS is enabled):', error.message);
    } else {
      console.log('Anon client read succeeded (if your table is public or RLS allows it):', data);
    }

    console.log('✅ Initial connectivity check complete');

  } catch (err) {
    console.error('❌ Setup failed:', err);
  }
}

async function getUserToken(email, password) {
  console.log(`Getting token for user: ${email}`);

  try {
    const resp = await supabase.auth.signInWithPassword({
      email,
      password
    });

    const { data, error } = resp;

    if (error) {
      console.error('❌ Authentication failed:', error.message || error);
      return null;
    }

    if (!data?.session?.access_token) {
      console.error('❌ No session/access_token returned. Response:', JSON.stringify(data));
      return null;
    }

    console.log('✅ Authentication successful');
    console.log('\n🚀 COPY THIS TOKEN for testing:');
    console.log('=====================================');
    console.log(data.session.access_token);
    console.log('=====================================\n');

    return data.session.access_token;

  } catch (err) {
    console.error('❌ Token retrieval failed:', err);
    return null;
  }
}

// Use a user-scoped client (so DB requests run with the user JWT and RLS applies)
function createUserClient(userToken) {
  if (!userToken) throw new Error('userToken required to create user client');
  const clientUrl = process.env.SUPABASE_URL || supabaseUrl;
  const clientKey = process.env.SUPABASE_ANON_KEY || supabaseKey;
  return createClient(clientUrl, clientKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    }
  });
}

async function testCreatedUser() {
  console.log('\n🔐 TESTING CREATED USER AUTHENTICATION\n');

  const testUser = {
    email: 'test2@example.com',
    password: 'password123'
  };

  const token = await getUserToken(testUser.email, testUser.password);

  if (!token) {
    console.log('\n❌ USER AUTHENTICATION FAILED — see errors above.');
    return null;
  }

  // Create user-scoped client to hit DB with user's JWT (RLS enforced)
  const userClient = createUserClient(token);

  try {
    const { data, error } = await userClient
      .from('user_profiles')
      .select('*')
      .limit(10);

    if (error) {
      console.error('❌ Authenticated DB query failed:', error.message || error);
      console.log('Possible causes: user has no rows, RLS denies access, token missing expected claims.');
    } else {
      console.log('✅ Authenticated DB query succeeded. Rows returned (may be empty):', data);
    }
  } catch (err) {
    console.error('❌ Error running authenticated DB query:', err);
  }

  console.log('\n✅ USER AUTHENTICATION TEST COMPLETE');
  console.log('🎯 You can now use the printed token for further testing of authenticated endpoints.');

  return token;
}

// Run sequence if executed directly
if (require.main === module) {
  (async () => {
    console.log(`
🎬 MOVIE STREAMING BACKEND - USER SETUP INSTRUCTIONS

1. Create test users in Supabase Auth dashboard (Authentication > Users)
   - Example users:
     - test2@example.com / password123
     - test@example.com / password123

2. Ensure the user email is confirmed (if your RLS or authentication requires confirmed emails).

3. Set environment variables and run:
SUPABASE_URL=<supabase_url> SUPABASE_ANON_KEY=<anon_key> node test-users-setup.js

This script will:
- Attempt an anon DB read (likely blocked by RLS)
- Sign in test2@example.com and print the user's access token
- Use the user's token to query user_profiles (so RLS runs as that user)
`);

    await testUserCreation();
    await testCreatedUser();
  })();
}

module.exports = { getUserToken, testUserCreation, testCreatedUser, createUserClient };