module.exports = {
    apps: [
        {
            name: "dadix-api",
            script: "npm",
            args: "run start",
            env: {
                NODE_ENV: "production",
            },
            autorestart: true,
        },
    ],
};
