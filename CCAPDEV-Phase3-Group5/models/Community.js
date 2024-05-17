const mongoose = require('mongoose')

const CommunitySchema = new mongoose.Schema({
    name: String,
    description: String
})

const Community = mongoose.model('Community', CommunitySchema)

module.exports = Community