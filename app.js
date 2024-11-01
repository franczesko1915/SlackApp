// Importování Bolt knihovny
const { App } = require('@slack/bolt');

// Inicializace aplikace pomocí OAuth tokenu a signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Slash příkaz pro přidání úkolu
app.command('/addtask', async ({ command, ack, say }) => {
  await ack();
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Úkol pro <@${command.user_id}>: Implementace funkce*`
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Označit jako splněno"
          },
          action_id: "mark_done"
        }
      }
    ],
    text: `Úkol pro <@${command.user_id}>: Implementace funkce`
  });
});

// Exportování aplikace jako serverless funkce pro Vercel
module.exports = async (req, res) => {
  await app.start();
  res.status(200).send("Slack app is running");
};
