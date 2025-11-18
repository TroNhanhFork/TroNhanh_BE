const mongoose = require("mongoose");
const Chat = require("../models/Chat");
const Message = require("../models/Message");

exports.getOrCreateChat = async (req, res) => {
  const { user1Id, user2Id } = req.body;

  console.log("user1Ids:", user1Id);
  console.log("user2Ids:", user2Id);

  try {
    if (!user1Id || !user2Id) {
      return res.status(400).json({ error: "Both user1Ids and user2Ids are required" });
    }

    const u1 = new mongoose.Types.ObjectId(user1Id);
    const u2 = new mongoose.Types.ObjectId(user2Id);

    let chat = await Chat.findOne({
      $or: [
        { user1Id: u1, user2Id: u2 },
        { user1Id: u2, user2Id: u1 },
      ],
    });

    if (!chat) {
      chat = await Chat.create({ user1Id: u1, user2Id: u2 });
    }

    res.status(200).json(chat);
  } catch (err) {
    console.error("Error in getOrCreateChat:", err);
    res.status(500).json({ error: err.message });
  }
};


exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId }).populate(
      "senderId",
      "name avatar"
    );
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.sendMessage = async (req, res) => {
  const { chatId, senderId, content } = req.body;
  console.log("Sending message:", { chatId, senderId, content });

  try {
    const message = await Message.create({ chatId, senderId, content });
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUserChats = async (req, res) => {
  const userId = req.params.userId;

  try {
    const chats = await Chat.find({
      $or: [{ user1Id: userId }, { user2Id: userId }]
    })
      .populate('user1Id', 'name avatar')
      .populate('user2Id', 'name avatar')
      .sort({ updatedAt: -1 }) // sắp xếp theo thời gian
      .lean(); // trả về JS object

    // Gắn thêm lastMessage
    for (let chat of chats) {
      const lastMsg = await Message.findOne({ chatId: chat._id }).sort({ time: -1 });
      chat.lastMessage = lastMsg;
    }

    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
