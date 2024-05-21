const express = require('express');
const path = require('path');
const hbs = require('hbs');
const app = express();

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const port = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware to parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded data

// Set up Handlebars view engine
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Route to fetch and display data on the index page
app.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    //console.log("Fetched data:", data); // Log the data to the console

    // Render the index.hbs template with the fetched data
    res.render('index', { users: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Example route to get a specific row from Supabase and log it
app.get('/data/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single(); // single() ensures we get a single row

    if (error) {
      return res.status(400).json({ error: error.message });
    }


    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/submit-login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single(); // Ensure a single match

    if (error || !data) {
      // Invalid credentials
      return res.status(401).render('index', {
        error: 'Invalid username or password.',
        users: [] // Pass users array if needed
      });
    }

    // Successful login
    res.redirect('/home');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/home', async function (req, res) {
  res.render('home');
});

app.post('/go-forum', async function (req, res) {
  res.redirect('/forum');
});

app.get('/forum', async function (req, res) {
  res.render('forum');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
