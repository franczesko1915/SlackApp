// Backend code to handle Slack button interactions in a Vercel app, including signature validation for security.

import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';
async function handleSlackTaskCompletion(req) {
  console.log('Starting async task handling...');
    console.log('Starting async task handling...');
  try {
    if (!req.body || !req.body.payload) {
      throw new Error('Payload is missing');
    }
    // Decode URL-encoded payload
    payload = decodeURIComponent(req.body.payload);
    payload = JSON.parse(payload);

    if (!payload || !payload.actions || !payload.actions[0]) {
      throw new Error('Invalid payload structure');
    }
    console.log('Payload parsed successfully:', payload);

    let docId, taskIndex;
    try {
      let actionValue;
    try {
      actionValue = JSON.parse(payload.actions[0].value);
      docId = actionValue.docId;
      taskIndex = actionValue.taskIndex;
      if (!docId || taskIndex === undefined) {
        throw new Error('Missing docId or taskIndex');
      }
      $1
    } catch (error) {
      console.error('Error extracting docId and taskIndex from payload:', error);
      return;
    }
    } catch (error) {
      console.error('Error extracting docId and taskIndex from payload:', error);
      return;
    }

    const responseUrl = payload.response_url;
    console.log('Proceeding with task handling asynchronously after Slack response.');

  console.log('Slack response sent. Proceeding with task handling asynchronously.');
  console.log('Slack response sent. Proceeding with task handling asynchronously.');

  // Google Apps Script integration to mark task as completed
  const SCOPES = ['https://www.googleapis.com/auth/documents'];
  const client = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\n/g, ''),
    scopes: SCOPES,
  });

  try {
    await client.authorize();
    console.log('Google client authorized successfully');
    const docs = google.docs({ version: 'v1', auth: client });

    const docRes = await docs.documents.get({ documentId: docId });
    console.log('Document retrieved successfully');
    if (!docRes.data.body.content[taskIndex] || !docRes.data.body.content[taskIndex].paragraph) {
      console.error('Invalid taskIndex, paragraph not found');
      return;
    }

    const taskText = docRes.data.body.content[taskIndex].paragraph.elements[0].textRun.content;
    const updatedText = `✅ ${taskText}`;

    await docs.documents.batchUpdate({
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
    });
    console.log('Document updated successfully');

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

    await fetch(responseUrl, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(responsePayload),
    });
    console.log('Response sent to Slack successfully');
  } catch (err) {
    console.error('Error during processing:', err);
  }
}

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

const app = express();
app.use(express.urlencoded({ extended: true })); // Middleware to parse JSON body
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

// Environment variables
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const slackToken = process.env.SLACK_BOT_TOKEN;

// Helper function to verify Slack request signature
function verifySlackRequest(req) {
  const slackSignature = req.headers['x-slack-signature'];
  const slackRequestTimestamp = req.headers['x-slack-request-timestamp'];
  
  if (!slackSignature || !slackRequestTimestamp) {
    console.error('Missing Slack signature or timestamp headers');
    return false;
  }

  const time = Math.floor(new Date().getTime() / 1000);
  
  // Deny requests older than 5 minutes
  if (Math.abs(time - slackRequestTimestamp) > 60 * 5) {
    console.error('Request timestamp is older than 5 minutes. Possible replay attack.');
    return false;
  }

  const sigBaseString = `v0:${slackRequestTimestamp}:${req.rawBody}`;
  const hmac = crypto.createHmac('sha256', slackSigningSecret);
  hmac.update(sigBaseString);
  const mySignature = `v0=${hmac.digest('hex')}`;

  const verified = crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
  if (!verified) {
    console.error('Slack request verification failed. Signature does not match.');
  }
  
  return verified;
}

// Endpoint to handle Slack button interactions
app.post('/api/task-complete', async (req, res) => {
  console.log('Received a request to /api/task-complete');
  console.log('Headers:', req.headers);

  if (!verifySlackRequest(req)) {
    console.error('Slack request verification failed');
    return res.status(400).send('Verification failed');
  }

  res.status(200).send('OK'); // Respond immediately to avoid timeout

  console.log('Slack request verified, response sent. Starting async task handling.');

  // Asynchronous operations are now moved to a separate function
  handleSlackTaskCompletion(req).catch(err => console.error('Error in async task handling:', err));

  
});

export default app;
