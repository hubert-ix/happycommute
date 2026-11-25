import { defineEnvVars } from '@sveltejs/kit/env';

// If your app already has src/env.js, just add these two entries to its variables object.
export const variables = defineEnvVars({
	SUPABASE_URL: {
		description: 'Supabase project URL, e.g. https://xxxx.supabase.co'
	},
	SUPABASE_SECRET_KEY: {
		description: 'Supabase secret key (sb_secret_...), server only'
	}
});