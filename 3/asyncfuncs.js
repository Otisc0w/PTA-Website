const { createClient } = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);


// Define fetchNotifications middleware
async function fetchNotifications(req, res, next) {
  if (!req.session.user) {
    return next(); // If no user is logged in, skip fetching notifications
  }

  const userId = req.session.user.id;

  try {
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('*')
      .eq('userid', userId)
      .order('created_at', { ascending: false });

    if (notificationsError) {
      console.error('Error fetching notifications:', notificationsError.message);
      return next(); // Skip notifications if there's an error
    }

    res.locals.notifications = notifications; // Attach notifications to res.locals
    next();
  } catch (error) {
    console.error('Server error:', error.message);
    next(); // Skip notifications if there's a server error
  }
}

// Define fetchUserData middleware
async function fetchUserData(req, res, next) {
  if (!req.session.user) {
    return next(); // If no user is logged in, skip fetching user data
  }

  const userId = req.session.user.id;

  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId);

    if (userError) {
      console.error('Error fetching user data:', userError.message);
      return next(); // Skip user data if there's an error
    }

    res.locals.userData = userData; // Attach user data to res.locals
    next();
  } catch (error) {
    console.error('Server error:', error.message);
    next(); // Skip user data if there's a server error
  }
}

exports.fetchUserData = fetchUserData;

exports.fetchNotifications = fetchNotifications;
