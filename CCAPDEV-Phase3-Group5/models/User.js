const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
    username: String,
    img: String,
    description: String,
    userSince: Number,
    password: String
})

const User = mongoose.model('User', UserSchema)

module.exports = User