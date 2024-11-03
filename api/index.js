// Backend code to handle Slack button interactions in a Vercel app, including signature validation for security.

const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Environment variables
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const slackToken = process.env.SLACK_BOT_TOKEN;

// Helper function to verify Slack request signature
function verifySlackRequest(req) {
  const slackSignature = req.headers['x-slack-signature'];
  const slackRequestTimestamp = req.headers['x-slack-request-timestamp'];
  const time = Math.floor(new Date().getTime() / 1000);

  // Deny requests older than 5 minutes
  if (Math.abs(time - slackRequestTimestamp) > 60 * 5) {
    return false;
  }

  const sigBaseString = `v0:${slackRequestTimestamp}:${req.rawBody}`;
  const hmac = crypto.createHmac('sha256', slackSigningSecret);
  hmac.update(sigBaseString);
  const mySignature = `v0=${hmac.digest('hex')}`;

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
}

// Middleware to parse raw body and make it available for signature validation
app.use((req, res, next) => {
  req.rawBody = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    req.rawBody += chunk;
  });
  req.on('end', () => {
    next();
  });
});

// Endpoint to handle Slack button interactions
app.post('/api/task-complete', (req, res) => {
  if (!verifySlackRequest(req)) {
    return res.status(400).send('Verification failed');
  }

  const payload = JSON.parse(req.body.payload);
  const { docId, taskIndex } = JSON.parse(payload.actions[0].value);
  const responseUrl = payload.response_url;

  // Google Apps Script integration to mark task as completed
  const { google } = require('googleapis');
  const { JWT } = require('google-auth-library');

  const SCOPES = ['https://www.googleapis.com/auth/documents'];
  const client = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });

  client.authorize((err, tokens) => {
    if (err) {
      console.error('Error authorizing Google client:', err);
      return res.status(500).send('Internal Server Error');
    }

    const docs = google.docs({ version: 'v1', auth: client });

    docs.documents.get({ documentId: docId }, (err, docRes) => {
      if (err) {
        console.error('Error retrieving document:', err);
        return res.status(500).send('Internal Server Error');
      }

      const taskText = docRes.data.body.content[taskIndex].paragraph.elements[0].textRun.content;
      const updatedText = `✅ ${taskText}`;

      docs.documents.batchUpdate(
        {
          documentId: docId,
          requestBody: {
            requests: [
              {
                updateTextStyle: {
                  textStyle: {
                    backgroundColor: {
                      color: {
                        rgbColor: { red: 0.83, green: 0.93, blue: 0.85 },
                      },
                    },
                  },
                  range: {
                    startIndex: taskIndex,
                    endIndex: taskIndex + taskText.length,
                  },
                },
              },
              {
                insertText: {
                  location: {
                    index: taskIndex,
                  },
                  text: updatedText,
                },
              },
            ],
          },
        },
        (err) => {
          if (err) {
            console.error('Error updating document:', err);
            return res.status(500).send('Internal Server Error');
          }

          // Respond to Slack with updated message
          const responsePayload = {
            replace_original: true,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `✅ ${taskText}`,
                },
              },
            ],
          };

          fetch(responseUrl, {
            method: 'post',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(responsePayload),
          })
            .then(() => res.status(200).send('OK'))
            .catch((err) => {
              console.error('Error sending response to Slack:', err);
              res.status(500).send('Internal Server Error');
            });
        }
      );
    });
  });
});

module.exports = app;
