// file: src/controllers/contractController.js

// ✅ IMPORT THIẾU ĐÃ ĐƯỢC THÊM VÀO
const fs = require("fs");
const path = require('path');
const PDFDocument = require("pdfkit");

const ContractTemplate = require('../models/ContractTemplate');
const BoardingHouse = require('../models/BoardingHouse');
const RentalContract = require('../models/RentalContract');

// Chủ trọ lấy mẫu hợp đồng của mình
exports.getOwnerContractTemplate = async (req, res) => {
    try {
        const template = await ContractTemplate.findOne({ ownerId: req.user.id });
        if (!template) {
            return res.status(404).json({ message: 'Chưa có mẫu hợp đồng nào được tạo.' });
        }
        res.status(200).json(template);
    } catch (error) {
        console.error("[GET OWNER CONTRACT ERROR]", error);
        res.status(500).json({ message: 'Lỗi server.' });
    }
};

// Chủ trọ tạo hoặc cập nhật mẫu hợp đồng
exports.createOrUpdateContractTemplate = async (req, res) => {
    try {
        const { title, content, signatureDataUrl } = req.body;
        const ownerId = req.user.id;

        const oldTemplate = await ContractTemplate.findOne({ ownerId });
        const oldSignaturePath = oldTemplate?.signatureImage;

        const updateData = { ownerId, title, content };

        if (signatureDataUrl) {
            const base64Data = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
            const filename = `signature-${ownerId}-${Date.now()}.png`;

            // ✅ BƯỚC BỀN VỮNG
            // 1. Định nghĩa đường dẫn đến thư mục
            const dirPath = path.join(process.cwd(), 'uploads', 'signatures');
            const filePath = path.join(dirPath, filename);

            // 2. Tự động tạo thư mục nếu nó chưa tồn tại
            await fs.promises.mkdir(dirPath, { recursive: true });

            // 3. Ghi file
            await fs.promises.writeFile(filePath, base64Data, 'base64');
            updateData.signatureImage = `/uploads/signatures/${filename}`;
        }

        const template = await ContractTemplate.findOneAndUpdate(
            { ownerId },
            updateData,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        if (oldSignaturePath && signatureDataUrl) {
            const oldFilePath = path.join(process.cwd(), oldSignaturePath);
            try {
                await fs.promises.unlink(oldFilePath);
                console.log(`Đã xóa chữ ký cũ thành công: ${oldFilePath}`);
            } catch (unlinkError) {
                console.warn(`Không tìm thấy file chữ ký cũ để xóa: ${oldFilePath}`);
            }
        }

        res.status(201).json({ message: 'Đã cập nhật mẫu hợp đồng thành công.', data: template });
    } catch (error) {
        console.error("[CONTRACT UPDATE ERROR]", error);
        res.status(500).json({ message: 'Lỗi server.' });
    }
};

// Người thuê lấy mẫu hợp đồng để xem
exports.getContractForTenant = async (req, res) => {
    try {
        const { boardingHouseId } = req.params;
        const boardingHouse = await BoardingHouse.findById(boardingHouseId).populate('ownerId');
        if (!boardingHouse) {
            return res.status(404).json({ message: 'Không tìm thấy nhà trọ.' });
        }

        const template = await ContractTemplate.findOne({ ownerId: boardingHouse.ownerId._id });
        if (!template) {
            return res.status(404).json({ message: 'Chủ nhà chưa tạo mẫu hợp đồng.' });
        }
        res.status(200).json(template);
    } catch (error) {
        console.error("[GET TENANT CONTRACT ERROR]", error);
        res.status(500).json({ message: 'Lỗi server.' });
    }
};


exports.saveContract = async (req, res) => {
    try {
        const newContract = await RentalContract.create({
            bookingId: req.body.bookingId,
            boardingHouseId: req.body.boardingHouseId,
            roomId: req.body.roomId,
            tenantId: req.body.tenantId,
            ownerId: req.body.ownerId,
            contractContent: req.body.content,

            // THÊM CHỮ KÝ TẠI ĐÂY
            signatureTenant: req.body.signatureTenant,

            contractStatus: 'pending_approval'
        });

        return res.status(201).json(newContract);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Cannot save contract" });
    }
};

exports.exportContract = async (req, res) => {
    try {
        const contract = await RentalContract.findById(req.params.id).populate('tenantId ownerId');
        if (!contract) return res.status(404).json({ message: "Contract not found" });

        // Lấy mẫu hợp đồng chủ trọ
        const template = await ContractTemplate.findOne({ ownerId: contract.ownerId._id });

        const doc = new PDFDocument();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=contract_${contract._id}.pdf`);
        doc.pipe(res);

        const fontPath = path.join(__dirname, "../font/dejavu-sans-ttf-2.37/ttf/DejaVuSans.ttf");
        doc.font(fontPath);

        doc.fontSize(20).text("HỢP ĐỒNG THUÊ PHÒNG", { align: "center" });
        doc.moveDown();
        doc.fontSize(12).text(contract.contractContent, { lineGap: 6 });

        // Chữ ký chủ trọ
        if (template?.signatureImage) {
            const sigPath = path.join(process.cwd(), template.signatureImage);
            if (fs.existsSync(sigPath)) {
                doc.moveDown().text("BÊN A (Chủ trọ):");
                doc.image(sigPath, { width: 120 });
                doc.text(contract.ownerId.name);
            }
        }

        // Chữ ký người thuê
        if (contract.signatureTenant) {
            let imgBuffer;
            if (contract.signatureTenant.startsWith("data:image")) {
                // Nếu là base64
                const base64Data = contract.signatureTenant.replace(/^data:image\/\w+;base64,/, "");
                imgBuffer = Buffer.from(base64Data, "base64");
            } else {
                // Nếu là đường dẫn file
                imgBuffer = fs.existsSync(contract.signatureTenant) ? contract.signatureTenant : null;
            }
            if (imgBuffer) {
                doc.moveDown().text("BÊN B (Người thuê):");
                doc.image(imgBuffer, { width: 120 });
                doc.text(contract.tenantId.name);
            }
        }

        doc.end();


    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Cannot export PDF" });
    }
};


exports.getContractById = async (req, res) => {
    const { id } = req.params;
    const contract = await Contract.findById(id)
        .populate('userId')
        .populate('roomId')
        .populate('boardingHouseId');

    if (!contract) {
        return res.status(404).json({ message: 'Contract not found' });
    }

    res.json(contract);
};

exports.getAllContracts = async (req, res) => {
    try {
        const contracts = await RentalContract.find()
            .populate('tenantId', 'name email')
            .populate('ownerId', 'name')  // Lấy tên chủ trọ
            .populate('roomId', 'roomNumber roomName price')
            .populate('boardingHouseId', 'name location')
            .sort({ signedAt: -1 });

        console.log("ID :", contracts[0].ownerId._id);
        const contractsWithOwnerSig = await Promise.all(
            contracts.map(async (contract) => {
                const template = await ContractTemplate.findOne({ ownerId: contract.ownerId._id });
                return {
                    ...contract.toObject(),
                    ownerSignature: template?.signatureImage || null
                };
            })
        );

        res.status(200).json(contractsWithOwnerSig);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};