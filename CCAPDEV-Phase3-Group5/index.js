// index.js

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// App stuff
//
///////////////////////////////////////////////////////////////////////////////////////////////////////////////

var mongoose = require('mongoose');
var express = require('express');
var app = express();

mongoose.connect('mongodb://localhost/apdevDB');

app.use('/stylesheets', express.static(__dirname + '/stylesheets'));
app.use('/images', express.static(__dirname + '/images'));
app.use(express.static(__dirname));

var fileUpload = require('express-fileupload')

var Post = require("./models/Post");
var Community = require("./models/Community");
var Comment = require("./models/Comment");
var User = require("./models/User");

var path = require('path');

var hbs = require('hbs')
app.set('view engine','hbs');

app.use(express.json()); // use json
app.use(express.urlencoded({extended: true})); // files consist of more than strings
app.use(express.static('public')); // we'll add a static directory named "public"
app.use(fileUpload()); // for fileuploads

var session = require('express-session');
var MongoStore = require('connect-mongo');

hbs.registerHelper('calculateVotes', function(upvotes, downvotes) {
    return upvotes.length - downvotes.length;
});

hbs.registerHelper('reverse', function(array) {
    return array.slice().reverse();
});

hbs.registerHelper('sortByProperty', function(array, property) {
    return array.slice().sort((a, b) => {
        var valueA = a[property].toLowerCase(); 
        var valueB = b[property].toLowerCase(); 

        if (valueA < valueB) {
            return -1;
        } else if (valueA > valueB) {
            return 1;
        } else {
            return 0;
        }
    });
});

hbs.registerHelper('calculateTotalVotes', function(posts) {
    var totalUpvotes = 0;
    var totalDownvotes = 0;

    posts.forEach(post => {
        totalUpvotes += post.upvotes.length;
        totalDownvotes += post.downvotes.length;
    });

    // Calculate the difference between total upvotes and downvotes
    var difference = totalUpvotes - totalDownvotes;

    return difference;
});

hbs.registerHelper('times', function(number) {
    return number * 35;
});

hbs.registerHelper('length', function(array) {
    return array.length;
});

hbs.registerHelper('removeFirst', function(string) {
    return string.slice(1);
});

hbs.registerHelper('commentLevelSymbol', function(number) {
    var symbols = '';
    for (var i = 0; i < number; i++) {
        symbols += '|';
    }
    return symbols;
});

hbs.registerHelper('edited', function(number) {
    if (number === 1) {
        return 'Edited'
    } else {
        return ''
    }
});

hbs.registerHelper('upvotes', function(upvotes, username) {
    if (upvotes.includes(username)) {
        return username;
    }
});

hbs.registerHelper('downvotes', function(downvotes, username) {
    if (downvotes.includes(username)) {
        return username;
    }
});

//Session
app.use(
    session({
        secret: 'hello',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false,
            httpOnly: true,
            maxAge: 3 * 7 * 24 * 60 * 60 * 1000
        },
        store: MongoStore.create({ 
            mongoUrl: 'mongodb://localhost/apdevDB',
            collectionName: 'sessions' 
        })
    })
);

// Set username value after logging in
app.post('/submit-login', async function(req, res) {
    var { username, password, remember } = req.body;

    var user = await User.findOne({ username: username });

    if (user && user.password === password) {
        if (remember) {
            req.session.username = username;
            console.log('sessionUsername: ' + req.session.username)
        } else {
            req.session.username = username;
            req.session.cookie.expires = false;
        }
        res.redirect('/home');
    } else {
        res.redirect('/?login=failed');
    }
});

app.get('/', async function(req, res) {
    if (req.session.username) {
        req.session.username = req.session.username;
        res.redirect('/home');
    } else {
        res.render('index');
    }
});

const guest = new User({
    username: '!!',
    img: 'profile.jpg',
    description: 'This is a guest user.',
    userSince: 0, 
    password: '!!' 
});

app.get('/guest', async function(req, res) {
    req.session.username = '!!'
    req.session.cookie.expires = false
    res.redirect('home')
});

app.get('/logout', async function(req, res) {
    req.session.destroy();
    res.redirect('/');
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// Add stuff to db 
//
///////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Create post
app.post('/submit-post', async function(req, res) {
    var today = new Date();
    var formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

    var latestPost = await Post.findOne().sort({ postId: -1 });
    var newPostId = latestPost ? latestPost.postId + 1 : 1;

    await Post.create({
        postId: newPostId,
        date: formattedDate,
        user: req.session.username,
        upvotes: [],
        downvotes: [],
        edited: 0,
        ...req.body,
    });

    res.redirect('/home');
});

// Create community
app.post('/submit-community', async function(req, res) {
    var communityName = '#' + req.body.name
    if (await Community.findOne({ name: { $regex: new RegExp('^' + communityName + '$', 'i') } })) {
        res.redirect('/home?community=failed')
    } else {
        await Community.create({
            ...req.body,
            name: communityName
        });
        res.redirect('/home?community=success')
    }
});

// Create user
app.post('/submit-user', async function(req, res) {
    if (await User.findOne({ username: { $regex: new RegExp('^' + req.body.username + '$', 'i') } })) {
        res.redirect('/?register=failed')
    } else {
        var currentYear = new Date().getFullYear()
        await User.create({
            ...req.body,
            img: 'profile.jpg',
            description: '',
            userSince: currentYear,
        });
        res.redirect('/?register=success')
    }
});

// Create comment
app.post('/submit-comment', async function(req, res) {
    var postId = Number(req.query.postId);
    if (req.session.username !== '!!') { 
        var today = new Date();
        var formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

        var latestComment = await Comment.findOne().sort({ commentId: -1 });
        var newCommentId = latestComment ? latestComment.commentId + 1 : 1;
        
        var parentId = req.query.parentId ? Number(req.query.parentId) : null; 

        var level = parentId ? await calculateCommentLevel(parentId) + 1 : 0; 

        await Comment.create({
            commentId: newCommentId,
            date: formattedDate,
            user: req.session.username,
            postId: postId,
            parentId: parentId,
            level: level, 
            edited: 0,
            ...req.body,
        });
        res.redirect('/post?postId=' + postId);
    } else {
        res.redirect('/post?postId=' + postId)
    }
});

async function calculateCommentLevel(commentId) {
    var comment = await Comment.findOne({ commentId: commentId }).exec();
    if (!comment) {
        return -1; // Comment not found
    }
    if (!comment.parentId) {
        return 0; // Top-level comment
    }
    // Recursive call to find the parent comment's level
    var parentLevel = await calculateCommentLevel(comment.parentId);
    return parentLevel + 1;
}

function sortComments(comments) {
    comments.sort((a, b) => b.commentId - a.commentId);
    var commentsByParentId = new Map();

    comments.forEach(comment => {
        var parentId = comment.parentId || 0; 
        if (!commentsByParentId.has(parentId)) {
            commentsByParentId.set(parentId, []);
        }
        commentsByParentId.get(parentId).push(comment);
    });

    var sortedComments = [];
    function addComments(parentId) {
        var comments = commentsByParentId.get(parentId) || [];
        comments.forEach(comment => {
            sortedComments.push(comment);
            addComments(comment.commentId); 
        });
    }
    addComments(0); 

    return sortedComments;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// Delete/edit from db
//
///////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Edit post/comment
app.post('/edit', async function(req, res) {
    var commentId = req.query.commentId
    var postId = req.query.postId
    var content = req.body.content

    if (commentId) {
        var comment = await Comment.findOne({commentId: commentId})
        await Comment.findOneAndUpdate({ commentId: commentId }, { content: content, edited: 1 })
        res.redirect('/post?postId=' + comment.postId)

    } else if (postId) {
        var post = await Post.findOne({postId: postId})
        await Post.findOneAndUpdate({ postId: postId}, { content: content, edited: 1 })
        res.redirect('/post?postId=' + post.postId)
    }
});

// Delete post/comment
app.get('/delete', async function(req, res) {
    var commentId = req.query.commentId
    var postId = req.query.postId

    if (commentId) {
        var comment = await Comment.findOne({commentId: commentId})
        await Comment.findOneAndUpdate({ commentId: commentId }, { content: '(Comment has been deleted)' })
        res.redirect('/post?postId=' + comment.postId)

    } else if (postId) {
        await Post.findOneAndDelete({ postId: postId})
        await Comment.deleteMany({ postId: postId })
        res.redirect('/home')
    }
});

// Edit profile
app.post('/submit-edit-profile', async function(req, res) {
    var username = req.session.username
    var updates = {}

    if (req.files && req.files.image) {
        var { image } = req.files
        await image.mv(path.resolve(__dirname, 'images', image.name));
        updates.img = image.name
    }

    if (req.body.description) {
        updates.description = req.body.description
    }

    await User.findOneAndUpdate({ username: username }, updates)

    res.redirect('/profile');
});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// Render stuff 
//
///////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/home', async function(req,res) {
    var communities = await Community.find({})
    if (req.session.username !== '!!') {
        var posts = await Post.find({})
        var user = await User.findOne({ username: req.session.username })
        console.log(user)
        res.render('home', { posts, user, communities })
    } else {
        var posts = await Post.find({}).sort({ createdAt: -1 }).limit(20)
        var user = guest
        res.render('home', { posts, user, communities })
    }
});

app.get('/post', async function(req, res) {
    var postId = Number(req.query.postId)
    var post = await Post.findOne({ postId: postId })
    var comments = await Comment.find({ postId: postId })
    
    comments = sortComments(comments);

    if (req.session.username !== '!!') { 
        var user = await User.findOne({ username: req.session.username })
    } else {
        var user = guest
    }
    res.render('post', { post, comments, user })
});

app.get('/create-post', async function(req, res) {
    if (req.session.username !== '!!') { 
        var communities = await Community.find({})
        var user = await User.findOne({ username: req.session.username })
        res.render('create-post', { communities, user })
    }
});

app.get('/profile', async function(req, res) {
    var username
    if (req.query.username) {
        username = req.query.username
    } else if (req.session.username !== '!!') {
        username = req.session.username
    } else {
        return
    }
    console.log('username: ' + username)
    var posts = await Post.find({ user: username })
    var comments = await Comment.find({ user: username })
    var user = await User.findOne({ username: username })
    res.render('profile', { posts, comments, user })

});

app.get('/community', async function(req, res) {
    var communityName = '#' + req.query.community
    console.log('communityName: ' + communityName)

    var community = await Community.findOne({ name: communityName})
    var posts = await Post.find({ community: communityName })
    var user = await User.findOne({ username: req.session.username })

    console.log('community: ' + community, 'posts: ' + posts)

    res.render('community', { community, posts, user })    
});

app.get('/edit-profile', async function(req, res) {
    var user = await User.findOne({ username: req.session.username })
    res.render('edit-profile', { user })
});

app.get('/register', async function(req, res) {
    res.render('register');
});

app.get('/create-community', async function(req, res) {
    if (req.session.username !== '!!') { 
        res.render('create-community');
    }
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                           //
//                                      UPVOTES AND DOWNVOTES                                                //
//                                                                                                           //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Upvote
app.get('/upvote', async function(req, res) {
    if (req.session.username !== '!!') { 
        var post = await Post.findOne({ postId: req.query.postId })
        var username = req.session.username

        var indexInUpvotes = post.upvotes.indexOf(username);
        var indexInDownvotes = post.downvotes.indexOf(username);

        if (indexInUpvotes === -1 && indexInDownvotes === -1) {
            // If username is not in post.upvotes[] nor in post.downvotes[]
            post.upvotes.push(username);
        } else if (indexInUpvotes !== -1) {
            // If username is already in post.upvotes[]
            post.upvotes.splice(indexInUpvotes, 1);
        } else if (indexInDownvotes !== -1) {
            // If username is already in post.downvotes[]
            post.downvotes.splice(indexInDownvotes, 1);
            post.upvotes.push(username);
        }

        await post.save();
        res.redirect('/post?postId=' + req.query.postId)
    }
});

// Downvote
app.get('/downvote', async function(req, res) {
    if (req.session.username !== '!!') { 
        var post = await Post.findOne({ postId: req.query.postId })
        var username = req.session.username

        var indexInUpvotes = post.upvotes.indexOf(username);
        var indexInDownvotes = post.downvotes.indexOf(username);

        if (indexInUpvotes === -1 && indexInDownvotes === -1) {
            // If username is not in post.upvotes[] nor in post.downvotes[]
            post.downvotes.push(username);
        } else if (indexInUpvotes !== -1) {
            // If username is already in post.upvotes[]
            post.upvotes.splice(indexInUpvotes, 1);
            post.downvotes.push(username);
        } else if (indexInDownvotes !== -1) {
            // If username is already in post.downvotes[]
            post.downvotes.splice(indexInDownvotes, 1);
        }

        await post.save();
        res.redirect('/post?postId=' + req.query.postId)
    }
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////

var server = app.listen(3000, function() {
    console.log("Node server running on port 3000");
});
