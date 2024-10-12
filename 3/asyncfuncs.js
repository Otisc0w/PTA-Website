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

async function checkAndExpireNCCRegistrations(req, res, next) {
  const currentDate = new Date();
  const currentDateString = currentDate.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

  try {
    const { data: registrations, error: registrationsError } = await supabase
      .from("ncc_registrations")
      .select("*");

    if (registrationsError) {
      throw new Error(`Error fetching NCC registrations: ${registrationsError.message}`);
    }

    const expiredRegistrations = registrations.filter(registration => {
      const expiresOn = new Date(registration.expireson);
      return expiresOn.toISOString().split('T')[0] === currentDateString;
    });

    if (expiredRegistrations.length > 0) {
      const ids = expiredRegistrations.map(registration => registration.id);
      const { error: updateError } = await supabase
        .from("ncc_registrations")
        .update({ status: 5 })
        .in("id", ids);

      if (updateError) {
        throw new Error(`Error updating NCC registration status: ${updateError.message}`);
      }

      console.log(`Updated status to 5 for ${expiredRegistrations.length} registrations.`);
    } else {
    }
    
  } catch (error) {
    console.error(error.message);
  }

  next();
}

async function checkAndExpireInstructorRegistrations(req, res, next) {
  const currentDate = new Date();
  const currentDateString = currentDate.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

  try {
    const { data: registrations, error: registrationsError } = await supabase
      .from("instructor_registrations")
      .select("*");

    if (registrationsError) {
      throw new Error(`Error fetching instructor registrations: ${registrationsError.message}`);
    }

    const expiredRegistrations = registrations.filter(registration => {
      const expiresOn = new Date(registration.expireson);
      return expiresOn.toISOString().split('T')[0] === currentDateString;
    });

    if (expiredRegistrations.length > 0) {
      const ids = expiredRegistrations.map(registration => registration.id);
      const { error: updateError } = await supabase
        .from("instructor_registrations")
        .update({ status: 5 })
        .in("id", ids);

      if (updateError) {
        throw new Error(`Error updating instructor registration status: ${updateError.message}`);
      }

      console.log(`Updated status to 5 for ${expiredRegistrations.length} instructor registrations.`);
    }
    
  } catch (error) {
    console.error(error.message);
  }

  next();
}


module.exports = {

  fetchNotifications,

  fetchUserData,

  checkAndExpireNCCRegistrations,

  checkAndExpireInstructorRegistrations

};