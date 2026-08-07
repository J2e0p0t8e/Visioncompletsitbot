import 'dotenv/config';

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const TARGET_USERNAMES = ['jayeahf_79219', 'ecksoner'];

const messagePart1a = `**Salut Jephte (Jaye) et Eckson,**

Voici les propositions de messages automatiques que le bot pourrait envoyer pour gérer la destitution des capitaines inactifs. L'idée est de rester bienveillant et de ne froisser personne :

**Option 1 (Amicale et directe) :**
> "Salut [Nom] ! 👋 C'est le bot Vision+ qui t'écrit au nom de l'équipe.
> On a remarqué que tu étais moins disponible ces derniers temps. On sait tous que la vie pro ou perso peut être bien remplie, et c'est tout à fait normal ! 
> Pour garder une bonne dynamique d'animation sur le serveur, on va libérer ton rôle de Capitaine pour le moment. Ce n'est absolument pas une sanction : on comprend que tes priorités actuelles soient ailleurs. Tu restes évidemment un membre super précieux de Vision+. 
> Dès que tu auras plus de temps et l'envie de t'investir à nouveau, la porte te sera toujours ouverte. Merci pour tout ce que tu as déjà apporté, et à très vite sur le serveur ! 🚀"`;

const messagePart1b = `**Option 2 (Plus courte et douce) :**
> "Bonjour [Nom], petit message automatique (mais plein de bienveillance !) de la part de l'équipe Vision+. 🤖
> Comme la communauté a besoin d'une présence régulière pour être bien animée, et qu'on a vu que tu avais un emploi du temps très chargé récemment, on va temporairement te retirer le rôle de Capitaine.
> Il n'y a aucun souci avec ça, la vraie vie passe avant tout ! Repose-toi bien, gère tes priorités, et n'hésite pas à nous faire signe quand tu seras de retour en pleine forme. Tu restes un membre important pour nous. ✌️"

**Option 3 (Très brève) :**
> "Salut [Nom] ! 👋
> L'équipe Vision+ m'a chargé de te passer un petit mot. On voit que tu as un emploi du temps bien rempli en ce moment ! 
> Afin de maintenir l'activité du serveur, ton rôle de Capitaine va être retiré pour l'instant. Il n'y a absolument aucun malaise : on sait que ce n'est pas toujours facile d'être partout à la fois.
> On tenait juste à te remercier pour ton aide jusqu'ici. Prends soin de toi et on se recroise très vite dans les salons ! 🌟"`;

const messagePart2 = `---
**💡 Petite note technique au passage concernant le code du projet :**
J'ai vu que vos pseudos Discord exacts (\`jayeahf_79219\` et \`ecksoner\`) sont inscrits "en dur" dans certains fichiers du code source (comme \`community-roles.ts\` ou \`challenge-notifications.ts\`). 

Sachez que **cela ne présente absolument aucun risque de sécurité**. Un pseudo (ou un ID) Discord est une donnée publique par nature. Personne ne peut pirater vos comptes, se connecter à votre place ou compromettre le serveur juste avec ces pseudos. C'est l'équivalent d'une adresse email publique sur une carte de visite. Le seul élément sensible à protéger est le *Token du Bot*, et celui-ci est bien sécurisé dans vos variables d'environnement !`;

async function main() {
    if (!TOKEN || !GUILD_ID) {
        console.error("TOKEN or GUILD_ID is missing.");
        process.exit(1);
    }

    try {
        console.log("Fetching guild members...");
        // 1. Fetch members matching usernames
        const users = [];
        for (const username of TARGET_USERNAMES) {
            const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=${username}`, {
                headers: {
                    'Authorization': `Bot ${TOKEN}`
                }
            });
            const data = await res.json();
            if (res.ok && data.length > 0) {
                // Find exact match
                const member = data.find(m => m.user.username.toLowerCase() === username.toLowerCase());
                if (member) {
                    users.push(member.user);
                } else {
                    console.log(`No exact match for username: ${username}`);
                }
            } else {
                console.log(`Failed to find user ${username} or API error:`, data);
            }
        }

        if (users.length === 0) {
            console.log("No targeted users found.");
            return;
        }

        // 2. Send DM to each user
        for (const user of users) {
            console.log(`Creating DM channel for ${user.username} (${user.id})...`);
            const channelRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ recipient_id: user.id })
            });

            const channelData = await channelRes.json();
            if (!channelRes.ok) {
                console.error(`Failed to create DM channel for ${user.username}:`, channelData);
                continue;
            }

            console.log(`Sending message to ${user.username}...`);
            const messageRes1 = await fetch(`https://discord.com/api/v10/channels/${channelData.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: messagePart1a })
            });

            if (messageRes1.ok) {
                console.log(`Successfully sent part 1a to ${user.username}`);
            } else {
                const messageError = await messageRes1.json();
                console.error(`Failed to send part 1a to ${user.username}:`, JSON.stringify(messageError.errors, null, 2));
            }
            
            const messageRes1b = await fetch(`https://discord.com/api/v10/channels/${channelData.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: messagePart1b })
            });

            if (messageRes1b.ok) {
                console.log(`Successfully sent part 1b to ${user.username}`);
            } else {
                const messageError = await messageRes1b.json();
                console.error(`Failed to send part 1b to ${user.username}:`, JSON.stringify(messageError.errors, null, 2));
            }

            const messageRes2 = await fetch(`https://discord.com/api/v10/channels/${channelData.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: messagePart2 })
            });

            if (messageRes2.ok) {
                console.log(`Successfully sent part 2 to ${user.username}`);
            } else {
                const messageError = await messageRes2.json();
                console.error(`Failed to send part 2 to ${user.username}:`, JSON.stringify(messageError.errors, null, 2));
            }
        }
    } catch (err) {
        console.error("An error occurred:", err);
    }
}

main();
