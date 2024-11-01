require('dotenv').config();
const { App } = require('@slack/bolt');
const { google } = require('googleapis');

// Inicializace aplikace Slack Bolt
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

// Autentizace pro Google API
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive']
});

// Slash příkaz pro zaslání úkolů do Slacku
app.command('/addtask', async ({ command, ack, say }) => {
  await ack();

  const docId = process.env.DOC_ID; // ID dokumentu z environmentálních proměnných
  const doc = google.docs({ version: 'v1', auth });

  try {
    const document = await doc.documents.get({ documentId: docId });
    const content = document.data.body.content;

    let tasks = [];
    let startCollecting = false;

    // Extrahování úkolů mezi značkami <úkoly> a </úkoly>
    content.forEach(element => {
      if (element.paragraph) {
        element.paragraph.elements.forEach(textElement => {
          const text = textElement.textRun ? textElement.textRun.content.trim() : '';

          if (text === '<úkoly>') {
            startCollecting = true;
          } else if (text === '</úkoly>') {
            startCollecting = false;
          } else if (startCollecting && text) {
            tasks.push({
              text,
              startIndex: textElement.startIndex,
              endIndex: textElement.endIndex
            });
          }
        });
      }
    });

    // Vytvoření zprávy s tlačítky pro každý úkol
    tasks.forEach((task, index) => {
      say({
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Úkol:* ${task.text}`
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Hotovo'
              },
              style: 'primary',
              action_id: `mark_done_${index}`,
              value: JSON.stringify({ docId, task, index })
            }
          }
        ],
        text: `Úkol: ${task.text}`
      });
    });

  } catch (error) {
    console.error('Error extracting tasks: ', error);
    await say('Nepodařilo se extrahovat úkoly z dokumentu.');
  }
});

// Obsluha kliknutí na tlačítko "Hotovo"
app.action(/mark_done_\d+/, async ({ body, ack, client }) => {
  await ack();

  const actionPayload = JSON.parse(body.actions[0].value);
  const { docId, task } = actionPayload;

  try {
    const doc = google.docs({ version: 'v1', auth });

    // Aktualizace Google Dokumentu – podbarvení úkolu a přidání fajfky
    await doc.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            updateTextStyle: {
              range: {
                startIndex: task.startIndex,
                endIndex: task.endIndex
              },
              textStyle: {
                backgroundColor: {
                  color: {
                    rgbColor: {
                      red: 0.9,
                      green: 1.0,
                      blue: 0.9
                    }
                  }
                }
              },
              fields: 'backgroundColor'
            }
          },
          {
            insertText: {
              location: {
                index: task.endIndex
              },
              text: ' ✅'
            }
          }
        ]
      }
    });

    // Aktualizace zprávy ve Slacku – změna tlačítka
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: body.message.blocks.map(block => {
        if (block.accessory && block.accessory.action_id === body.actions[0].action_id) {
          block.accessory.text.text = '✅ Hotovo';
          block.accessory.style = 'primary';
          block.accessory.action_id = null; // Deaktivace tlačítka
        }
        return block;
      }),
      text: body.message.text
    });

  } catch (error) {
    console.error('Error updating document or Slack message: ', error);
  }
});

// Spuštění aplikace
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Slack Bolt app is running!');
})();
