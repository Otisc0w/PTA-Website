const express = require('express');
const path = require('path');
var hbs = require('hbs');
const app = express();

app.set('view engine','hbs');

app.use(express.static(__dirname));
app.use('/stylesheets', express.static(__dirname + '/stylesheets'));


app.listen(3000, () => {
    console.log("App listening on prot 3000");
})

app.get('/', async function(req, res) {
    res.render('index')
});