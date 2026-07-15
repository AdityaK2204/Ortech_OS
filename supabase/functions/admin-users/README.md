# `admin-users` Edge Function (optional)

Lets an **admin create new user accounts from inside the app** (the "Invite user"
button on the Users page). It's optional — everything else on the Users page
(roles, site assignment, enable/disable) works without it.

Why a function? Creating auth users needs the **service-role key**, which must
never ship in the browser. The function runs server-side, verifies the caller is
an admin, then creates the account.

## Deploy (one time)

Prereqs: [Supabase CLI](https://supabase.com/docs/guides/cli) installed, Docker running.

```bash
# from the project root
supabase login
supabase link --project-ref eqpyfrnaoijugbdqnnej   # your project ref

# deploy the function
supabase functions deploy admin-users
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by the platform — you do **not** need to set them as secrets.

That's it. Reload the app and **Invite user** will create accounts directly.

## Without deploying

The app detects the function isn't there and shows a friendly note: add users via
**Supabase dashboard → Authentication → Users → Add user**, then set their role
and site assignment on the Users page. Same result, one extra hop.

## Security

- The caller's JWT is verified; their `profiles.role` must be `admin`.
- Passwords: if you don't provide one, a random temporary password is generated
  and returned once to the admin to share with the user.
