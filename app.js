// Importování knihoven
require('dotenv').config();
const { App } = require('@slack/bolt');

// Inicializace aplikace pomocí OAuth tokenu a signing secret z environmentálních proměnných
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN // Tohle použijete, pokud chcete používat Socket Mode
});

// Slash příkaz pro přidání úkolu
app.command('/addtask', async ({ command, ack, say }) => {
  // Acknowledge příkaz
  await ack();

  // Odeslání zprávy s tlačítkem
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

// Event pro kliknutí na tlačítko "Označit jako splněno"
app.action('mark_done', async ({ body, ack, say, client }) => {
  // Acknowledge kliknutí na tlačítko
  await ack();

  try {
    // Přidání reakce fajfky k původní zprávě
    await client.reactions.add({
      channel: body.channel.id,
      name: 'white_check_mark',
      timestamp: body.message.ts
    });

    // Informace, že úkol byl označen jako splněný
    await say(`<@${body.user.id}> označil úkol jako splněný! ✅`);
  } catch (error) {
    console.error("Error adding reaction: ", error);
  }
});

// Spuštění aplikace
(async () => {
  // Aplikace naslouchá na portu 3000 nebo na portu, který je nastavený v environmentálních proměnných
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Slack Bolt app is running!');
})();
