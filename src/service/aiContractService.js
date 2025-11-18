const BoardingHouse = require('../models/BoardingHouse');
const ContractTemplate = require('../models/ContractTemplate');
const { chatWithAIStreaming } = require('./aiService');

async function buildPrompt({ owner, listing, ownerPrompt }) {
    const ownerName = owner?.name || 'Chủ nhà';
    const address = listing?.location?.street ? `${listing.location.street}, ${listing.location.district}` : 'Địa chỉ không xác định';
    const sample = `Create a Vietnamese rental contract for owner ${ownerName} at ${address}.
Lease details: ${ownerPrompt || 'Standard monthly lease'}.
Include placeholders: {{tenantName}}, {{tenantEmail}}, {{customerPhone}}, {{ownerName}}, {{houseAddress}}, {{ownerPhone}}, {{roomNumber}}, {{roomPrice}}, {{roomArea}}, {{currentDate}}.
Tone: formal, clear, use headings and bullet points.

Additional strict constraints for the model:
- The output content must start **with the correct line:**
  "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"
  "Độc lập - Tự do - Hạnh phúc"
- ONLY output the contract text in plain UTF-8 text. Do NOT output JSON, Markdown, HTML, or any code fences.
- Information should be follow this format exactly, do NOT change the placeholder format:
    "BÊN CHO THUÊ (BÊN A):"
    "Ông/Bà: {{ownerName}}"
    "Địa chỉ thường trú: {{houseAddress}}"
    "Số điện thoại: {{ownerPhone}}"
    "Email: {{ownerEmail}}"

    "BÊN THUÊ (BÊN B):"
    "Ông/Bà: {{tenantName}}"
    "Số điện thoại: {{customerPhone}}"
    "Email: {{tenantEmail}}"
- Do NOT include signatures and representatives of the parties (only the contract body).
- Do NOT include any opening phrases such as "Here is", "Great", "Okay", or any salutations or small talk.
- Do NOT include signatures and representatives of the parties (only the contract body).
- Do NOT include instructions to the reader, meta commentary, or any explanatory sentences.
- Do NOT output numbered developer notes or logs; produce only the contract content.
- Use the placeholders exactly as shown (e.g., {{tenantName}}) where appropriate; do not explain them.
- Keep the language Vietnamese and ensure correct grammar and punctuation.
`;
    return sample;
}

async function generateContract({ owner, listingId, ownerPrompt, model }) {
    const listing = listingId ? await BoardingHouse.findById(listingId) : null;
    const prompt = await buildPrompt({ owner, listing, ownerPrompt });

    // Collect streaming chunks
    let text = '';
    await chatWithAIStreaming(prompt, (chunk) => { text += chunk; }, model);
    return { text, prompt };
}

async function saveAsTemplate({ ownerId, title = 'Hợp đồng thuê nhà', content }) {
    const existing = await ContractTemplate.findOne({ ownerId });
    if (existing) {
        existing.title = title;
        existing.content = content;
        await existing.save();
        return existing;
    } else {
        return ContractTemplate.create({ ownerId, title, content });
    }
}

module.exports = { generateContract, saveAsTemplate };