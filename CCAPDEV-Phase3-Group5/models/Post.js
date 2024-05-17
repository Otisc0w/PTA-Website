const mongoose = require('mongoose')

const PostSchema = new mongoose.Schema({
    postId: Number,
    community: String,
    title: String,
    content: String,
    date: String,
    user: String,
    upvotes: Array,
    downvotes: Array,
    edited: Number
})

const Post = mongoose.model('Post', PostSchema)

module.exports = Post