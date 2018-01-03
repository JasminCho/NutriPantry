var express = require('express');
var app = express();
var request = require('request');

//passport stuff
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth20').Strategy;

//mongodb stuff
var mongoose = require('mongoose');
mongoose.connect('mongodb://jasmincho97:Yesulga#1@nutripantry-shard-00-00-uk3iz.mongodb.net:27017,nutripantry-shard-00-01-uk3iz.mongodb.net:27017,nutripantry-shard-00-02-uk3iz.mongodb.net:27017/NutriPantry?ssl=true&replicaSet=NutriPantry-shard-0&authSource=admin');

//mongodb API key: ebd92fcb-3b32-4b6a-96d3-61486cd13e4d

var User = mongoose.model('User', { name: String, googleId: String });
var SavedRecipe = mongoose.model('SavedRecipe', { yummly_id: String, title: String, image: String, user_id: String });

passport.use(new GoogleStrategy({
    clientID: '382544696513-biauv0qfqb2ubc1suivu7dsinmi9hst4.apps.googleusercontent.com',
    clientSecret: 'MNF0Ruj6PKN32VEvQ3DD5Wg0',
    callbackURL: process.env.GOOGLE_API_CALLBACK_URL || "http://localhost:3000/auth/google/callback"
  },
  function(accessToken, refreshToken, profile, cb) {
  	var query = { googleId: profile.id },
  		update = { googleId: profile.id, name: profile.displayName },
  		options = { upsert: true, new: true, setDesfaultsOnInsert: true };

		User.findOneAndUpdate(query, update, options, function (err, user) {
  		return cb(err, user);
  	})
  }
));

app.use(express.static('public'));
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: 'keyboard cat', resave: true, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, cb) {
	cb(null, user);
});

passport.deserializeUser(function(user, cb) {
	cb(null, user);
});

function authenticationMiddleware() {
	return function(req, res, next) {
		if (req.isAuthenticated()) {
			return next();
		}
		res.redirect('/login');
	}
}

app.set("view engine", "ejs");

app.use(function(req, res, next){
	req.active = req.path.split('/')[1]
	next();
})

app.get("/", function (req, res) {
	res.render("home", { user: req.user });
});

app.get("/results", function (req,res){
	var query = encodeURIComponent(req.query.search);

	request("http://api.yummly.com/v1/api/recipes?_app_id=a9122fd7&_app_key=4d90e1e44259cee1f25593bef5f156ee&q=" + query, function (error, response, body) {
		if(!error && response.statusCode == 200) {
			var data = JSON.parse(body);

			data["matches"].forEach(function(match) {
				match["recipeName"] = truncateString(match["recipeName"], 40);
			})

			res.render("results", { user: req.user, data:data, searchTerm: req.query.search });
		}
	})

});

app.post("/save", authenticationMiddleware(), function (req, res) {
	var query = { yummly_id: req.body.yummly_id, user_id: req.user._id },
	update = { yummly_id: req.body.yummly_id, title: req.body.title, image: req.body.image, user_id: req.user._id },
	options = { upsert: true, new: true, setDefaultsOnInsert: true };

	// Find the document
	SavedRecipe.findOneAndUpdate(query, update, options, function(error, result) {
		if (error) return;

		res.redirect(req.get('Referrer'));
	});
});

app.post("/unsave", authenticationMiddleware(), function (req, res) {
	SavedRecipe.remove({ yummly_id: req.body.yummly_id, user_id: req.user._id }, function (err) {
	  if (err) return handleError(err);
		res.redirect(req.get('Referrer'));	  
	});
});

app.get("/login", function(req,res) {
	res.redirect('auth/google');
	// res.render("login", { user: req.user });
})

app.get('/logout', authenticationMiddleware(), function (req, res){
  req.session.destroy(function (err) {
    res.redirect('/');
  });
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/profile');
});

app.get("/signup", function(req, res) {
	res.render("signup", { user: req.user });
})

app.get("/profile", authenticationMiddleware(), function (req, res) {
	SavedRecipe
		.find({ user_id: req.user._id })
		.select('title image yummly_id')
		.exec(function (error, savedRecipes) {
			if (error) return;
				res.render("profile", { savedRecipes: savedRecipes, user: req.user });
		});
})

app.get("/profile/nutrinalysis/:yummlyId", authenticationMiddleware(), function (req, res) {
	request("http://api.yummly.com/v1/api/recipe/" + req.params.yummlyId + "?_app_id=a9122fd7&_app_key=4d90e1e44259cee1f25593bef5f156ee&q", function (error, response, body) {
		if (error) {
			handleError(error);
		}
		if(!error && response.statusCode == 200) {
			var data = JSON.parse(body);
			
		SavedRecipe
			.find({ user_id: req.user._id })
			.select('title image yummly_id')
			.exec(function (error, savedRecipes) {
				if (error) return;
					res.render("profile_nutrinalysis.ejs", { savedRecipes: savedRecipes, data: data, user: req.user });
			});
		}
	})

})

app.get("/about", function(req,res){
    res.render("about", { user: req.user });
});

app.get("/trending", function(req,res){
		var query = "chicken";
		request("http://food2fork.com/api/search?key=7b06277da7095e664ae6618ae00bbe4b&q=" + query, function(error, response, body) {
		if(!error && response.statusCode == 200) {
				var data = JSON.parse(body);
				data["recipes"].forEach(function(match) {
					match["title"] = truncateString(match["title"], 40);
				})
				res.render("trending", { data:data, user: req.user });
		}
	});
});

var port = process.env.PORT || 3000;

app.listen(port, process.env.IP, function () {
  console.log('App has started on port ' + port)
})

function truncateString(str, length) {
	if(str.length > length) {
    	return str.substring(0, length - 3) + "...";
    }
    else {
        return str;
    }
}

function handleError(error) {
	console.error(err.stack)
	res.status(500).send('Something broke!')
}