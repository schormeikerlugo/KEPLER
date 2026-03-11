fetch('http://localhost:54321/rest/v1/entidades_biometricas?select=id%2Cnombre%2Ccategoria%2Czona_localizado%2Cimage_url&user_id=eq.' + '549562ae-14df-427e-8833-5cac3638c216' + '&order=created_at.desc&limit=10', {
    headers: {
        'apikey': process.env.VITE_SUPABASE_ANON_KEY || 'dummy',
        'Authorization': 'Bearer ' + (process.env.VITE_SUPABASE_ANON_KEY || 'dummy')
    }
}).then(res => res.json()).then(console.log).catch(console.error);
