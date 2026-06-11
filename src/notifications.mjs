const TASK_NOTIFY_EMAIL = process.env.TASK_NOTIFY_EMAIL || "tommy@keystone.studio";
const TASK_NOTIFY_PHONE = process.env.TASK_NOTIFY_PHONE || "+18456633682";

export async function sendTaskDoneNotification(task) {
  const results = [];
  const text = notificationText(task);

  results.push(await sendEmail(`Done: ${task.title}`, text));
  results.push(await sendSms(text));
  results.push(await sendDiscordDm(text));
  results.push(await sendWebhook("task.done", task, text));

  const sent = results.filter((result) => result.sent);
  return {
    sent: sent.length > 0,
    channels: sent.map((result) => result.channel),
    results,
    message: sent.length
      ? `Task done ping sent by ${sent.map((result) => result.channel).join(" and ")}.`
      : "Task completed. Email/text provider is not configured yet."
  };
}

export async function sendRingNotification(input) {
  const ring = {
    urgency: input.urgency,
    description: input.description,
    task: input.task || null,
    created_at: new Date().toISOString()
  };
  const text = [
    `Ring: ${ring.urgency}`,
    ...(ring.task ? ringTaskLines(ring.task) : []),
    "",
    ring.description,
    "",
    "Someone needs attention in Keystone Tasks."
  ].join("\n");
  const subject = ring.task
    ? `Ring: ${ring.urgency} - ${ring.task.title}`
    : `Ring: ${ring.urgency}`;
  const results = [];

  results.push(await sendEmail(subject, text));
  results.push(await sendSms(text));
  results.push(await sendDiscordDm(text));
  results.push(await sendWebhook("ring.requested", ring, text));

  const sent = results.filter((result) => result.sent);
  return {
    sent: sent.length > 0,
    channels: sent.map((result) => result.channel),
    results,
    message: sent.length
      ? `Ring sent by ${sent.map((result) => result.channel).join(" and ")}.`
      : "Ring created. Email/text provider is not configured yet."
  };
}

function ringTaskLines(task) {
  return [
    `Task: ${task.title}`,
    `Assignee: ${task.assignee}`,
    task.status ? `Status: ${task.status}` : "",
    task.category ? `Category: ${task.category}` : "",
    task.due_date ? `Due: ${task.due_date}` : ""
  ].filter(Boolean);
}

function notificationText(task) {
  return [
    `Task completed: ${task.title}`,
    `Assignee: ${task.assignee}`,
    task.category ? `Category: ${task.category}` : "",
    task.due_date ? `Due: ${task.due_date}` : "",
    task.details ? `Task: ${task.details}` : ""
  ].filter(Boolean).join("\n");
}

async function sendEmail(subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TASK_NOTIFY_FROM || "Keystone Tasks <onboarding@resend.dev>";
  if (!apiKey) return skipped("email", "RESEND_API_KEY is missing.");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: TASK_NOTIFY_EMAIL,
        subject,
        text
      })
    });
    if (!response.ok) {
      return skipped("email", await response.text());
    }
    return { channel: "email", sent: true };
  } catch (error) {
    return skipped("email", error.message);
  }
}

async function sendSms(text) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    return skipped("text", "Twilio settings are missing.");
  }

  const body = new URLSearchParams({
    To: TASK_NOTIFY_PHONE,
    From: from,
    Body: text
  });

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    if (!response.ok) {
      return skipped("text", await response.text());
    }
    return { channel: "text", sent: true };
  } catch (error) {
    return skipped("text", error.message);
  }
}

async function sendWebhook(event, payload, text) {
  const url = process.env.TASK_DONE_WEBHOOK_URL;
  if (!url) return skipped("webhook", "TASK_DONE_WEBHOOK_URL is missing.");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        recipient_email: TASK_NOTIFY_EMAIL,
        recipient_phone: TASK_NOTIFY_PHONE,
        text,
        payload
      })
    });
    if (!response.ok) {
      return skipped("webhook", await response.text());
    }
    return { channel: "webhook", sent: true };
  } catch (error) {
    return skipped("webhook", error.message);
  }
}

async function sendDiscordDm(text) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const userId = process.env.DISCORD_USER_ID;
  if (!token || !userId) return skipped("discord", "DISCORD_BOT_TOKEN or DISCORD_USER_ID is missing.");

  try {
    const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: userId })
    });
    if (!dmRes.ok) return skipped("discord", await dmRes.text());
    const { id: channelId } = await dmRes.json();

    const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: text })
    });
    if (!msgRes.ok) return skipped("discord", await msgRes.text());
    return { channel: "discord", sent: true };
  } catch (error) {
    return skipped("discord", error.message);
  }
}

function skipped(channel, reason) {
  return { channel, sent: false, reason };
}
