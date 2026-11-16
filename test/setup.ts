// Tests see the endpoint, client id and key they set themselves, never the
// ones in the shell that runs them.
delete process.env.FORMSPREE_API_URL;
delete process.env.FORMSPREE_CLIENT_ID;
delete process.env.FORMSPREE_API_KEY;
