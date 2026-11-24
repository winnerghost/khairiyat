/**
 * npm run agent:sync            create or update the ElevenLabs agent from agent/
 * npm run agent:sync -- --dry-run   print what would be sent, change nothing
 *
 * Needs ELEVENLABS_API_KEY. If ELEVENLABS_AGENT_ID is set, that agent is
 * updated (PATCH); otherwise a new agent is created and its id printed.
 * Docs: https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create
 *       https://elevenlabs.io/docs/eleven-agents/api-reference/agents/update
 */
import { AGENT_NAME, buildAgentPayload } from "../agent/agent.config";

async function main() {
  const dry = process.argv.includes("--dry-run");
  const base = (process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io").replace(/\/$/, "");
  const payload = buildAgentPayload({
    voiceIdFemale: process.env.ELEVENLABS_VOICE_ID_FEMALE || undefined,
    postCallWebhookId: process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID || undefined,
  });
  if (dry) {
    console.log(
      JSON.stringify(
        {
          ...payload,
          conversation_config: {
            ...payload.conversation_config,
            agent: {
              ...payload.conversation_config.agent,
              prompt: {
                ...payload.conversation_config.agent.prompt,
                prompt: `<${payload.conversation_config.agent.prompt.prompt.length} chars from agent/system-prompt.md>`,
              },
            },
          },
        },
        null,
        2,
      ),
    );
    return;
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Set ELEVENLABS_API_KEY (in .env.local) first.");
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const headers = { "xi-api-key": key, "content-type": "application/json" };

  if (agentId) {
    const res = await fetch(`${base}/v1/convai/agents/${encodeURIComponent(agentId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Update failed: HTTP ${res.status} ${text.slice(0, 1000)}`);
    console.log(`✅ Updated agent ${agentId} ("${AGENT_NAME}") from agent/.`);
  } else {
    const res = await fetch(`${base}/v1/convai/agents/create`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Create failed: HTTP ${res.status} ${text.slice(0, 1000)}`);
    const { agent_id } = JSON.parse(text) as { agent_id: string };
    console.log(`✅ Created agent "${AGENT_NAME}": ${agent_id}`);
    console.log(`Add this to .env.local:\nELEVENLABS_AGENT_ID=${agent_id}`);
  }
  if (!process.env.ELEVENLABS_VOICE_ID_FEMALE)
    console.log(
      "ℹ️  No ELEVENLABS_VOICE_ID_FEMALE set: the agent uses ElevenLabs' default voice. Pick a warm Hindi voice and set it.",
    );
  if (!process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID)
    console.log(
      "ℹ️  No ELEVENLABS_POST_CALL_WEBHOOK_ID: set the post-call webhook in ElevenLabs → Agents → Settings (see docs/GO_LIVE.md).",
    );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
