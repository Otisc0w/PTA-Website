const mongoose = require('mongoose')

const CommentSchema = new mongoose.Schema({
    commentId: Number,
    content: String,
    date: String,
    user: String,
    postId: Number,
    parentId: Number,
    level: Number,
    edited: Number
})

const Comment = mongoose.model('Comment', CommentSchema)

module.exports = Comment