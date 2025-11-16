const { generateContract, saveAsTemplate } = require('../service/aiContractService');

exports.preview = async (req, res) => {
    try {
        const owner = req.user; // auth middleware fills req.user
        const { listingId, prompt, model } = req.body || {};

        let ownerPrompt = prompt;

        // If no prompt and no listingId provided, try to use owner's saved ContractTemplate as prompt
        if ((!ownerPrompt || String(ownerPrompt).trim().length === 0) && !listingId) {
            // lazy-load ContractTemplate to use as a base prompt
            const ContractTemplate = require('../models/ContractTemplate');
            const template = await ContractTemplate.findOne({ ownerId: owner.id });
            if (template && template.content) {
                ownerPrompt = template.content;
            }
        }

        // Still require at least a prompt or a listingId
        if ((!ownerPrompt || String(ownerPrompt).trim().length === 0) && !listingId) {
            return res.status(400).json({ message: 'Vui lòng cung cấp prompt ngắn hoặc listingId để tạo hợp đồng.' });
        }

        const result = await generateContract({ owner, listingId, ownerPrompt, model });
        res.json({ description: result.text, promptUsed: result.prompt });
    } catch (err) {
        console.error('[AI CONTRACT PREVIEW ERROR]', err);
        res.status(500).json({ message: 'Lỗi khi tạo hợp đồng' });
    }
};

exports.generateAndSave = async (req, res) => {
    try {
        const owner = req.user;
        const { listingId, prompt, model, title } = req.body || {};

        let ownerPrompt = prompt;

        // If missing prompt & listingId, try to use existing ContractTemplate
        if ((!ownerPrompt || String(ownerPrompt).trim().length === 0) && !listingId) {
            const ContractTemplate = require('../models/ContractTemplate');
            const template = await ContractTemplate.findOne({ ownerId: owner.id });
            if (template && template.content) {
                ownerPrompt = template.content;
            }
        }

        if ((!ownerPrompt || String(ownerPrompt).trim().length === 0) && !listingId) {
            return res.status(400).json({ message: 'Vui lòng cung cấp prompt ngắn hoặc listingId để tạo và lưu hợp đồng.' });
        }

        const { text } = await generateContract({ owner, listingId, ownerPrompt: ownerPrompt, model });
        const saved = await saveAsTemplate({ ownerId: owner.id, title: title || 'Hợp đồng thuê nhà', content: text });
        res.json({ saved });
    } catch (err) {
        console.error('[AI CONTRACT SAVE ERROR]', err);
        res.status(500).json({ message: 'Lỗi khi lưu mẫu hợp đồng' });
    }
};