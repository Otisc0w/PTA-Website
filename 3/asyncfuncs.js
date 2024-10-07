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

async function checkAndExpireNCCRegistrations() {
  const currentDate = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
  const { data: registrations, error: registrationsError } = await supabase
    .from("ncc_registrations")
    .select("*");

  if (registrationsError) {
    console.error("Error fetching NCC registrations:", registrationsError.message);
  } else {
    for (const registration of registrations) {
      if (registration.expireson == currentDate) {
        const { error: updateError } = await supabase
          .from("ncc_registrations")
          .update({ status: 5 })
          .eq("id", registration.id);

        if (updateError) {
          console.error("Error updating NCC registration status:", updateError.message);
        }
      }
    }
  }
}


module.exports = {

  fetchNotifications,

  fetchUserData,

  checkAndExpireNCCRegistrations,

};