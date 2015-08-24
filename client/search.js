var logger = new Logger('Client:search');

Logger.setLevel('Client:search', 'trace');
// Logger.setLevel('Client:search', 'debug');
// Logger.setLevel('Client:search', 'info');
// Logger.setLevel('Client:search', 'warn');

var resultLength = 0;
var options = {
    keepHistory: 1000 * 60 * 5,
    localSearch: true
};
var fields = ['content'];
DocSearch = new SearchSource('documents', fields, options);

Template.SeedDocument.helpers({
    sentences: function() {
        logger.debug("Getting sentences...");
        return Sentences.find({docID: Session.get("currentDoc")._id},
                                {sort: {psn: 1}});
    }
});

Template.SearchBar.events({
    'click .search-apply-btn' : function(){
        var query = $('#search-query').val(); // grab query from text form
        Session.set("searchQuery",query);
        DocSearch.search(query);
        $('.search-apply-btn').addClass('btn-success');
        // logger.trace("Created new query: " + Session.get("searchQuery"));
    },

    'keyup input' : function(e, target){
        // logger.debug(e);
        // logger.debug(target);
        if(e.keyCode===13) {
          var btn = $('.search-apply-btn')
          btn.click();
        }
    },

    // clear full-text search of idea content
    'click .search-remove-btn' : function(){
        Session.set("searchQuery","############################");
        DocSearch.search("############################");
        $('.search-apply-btn').removeClass('btn-success');
        $('#search-query').val("");
        $('.doc-match').unhighlight();
    },
})

Template.SearchResults.rendered = function () {
    DocSearch.search("############################");
    Session.set("matchingDocs", []);
};

Template.SearchResults.helpers({
    matchingDocs: function() {
        var query = Session.get("searchQuery");
        var queryMatchData = getMatches();
        // logger.trace(JSON.stringify(queryMatches));
        Session.set("lastMatchSet", queryMatchData);
        EventLogger.logNewSearch(query)
        return queryMatchData.matches;
    },
    hasMatches: function() {
        var resultLength = getMatches().matches.length;
        // resultLength = DocSearch.getData({
        //       transform: function(matchText, regExp) {
        //         return matchText.replace(regExp, "<b>$&</b>")
        //       },
        //       sort: {isoScore: -1}
        //     }).length;
        if (resultLength < 1) {
            return false;
        } else {
            return true;
        }
    },
    numMatches: function() {
        return getMatches().matches.length;
        // return DocSearch.getData({
        //       transform: function(matchText, regExp) {
        //         return matchText.replace(regExp, "<b>$&</b>")
        //       },
        //       sort: {isoScore: -1}
        //     }).length;
    }
});

Template.Selections.helpers({
    selectedDocs: function() {
        var user = Session.get("currentUser");
        var docMatches = DocMatches.find({userID: user._id, seedDocID: Session.get("currentDoc")._id}).fetch();
        var matchingDocs = []
        docMatches.forEach(function(m) {
            matchingDocs.push(m.matchDocID);
        });
        return Documents.find({_id: {$in: matchingDocs}});
    }
});

Template.Document.rendered = function() {
    $('.doc-match').unhighlight();
    var query = Session.get("searchQuery");
    $('.doc-match').highlight(query.split(" "));
};

Template.Document.helpers({
    sentences: function() {
        return Sentences.find({docID: this._id}, {sort: {psn: 1}});
    }
});

Template.Document.events({
    'click .match-add': function() {
        logger.debug("Clicked match button");
        var thisDoc = this;
        MatchManager.addMatch(Session.get("currentDoc"), thisDoc);
        var matchData = Session.get("lastMatchSet");
        logger.trace("Last match set: " + JSON.stringify(matchData));
        var allMatches = matchData.matches;
        var ranks = matchData.ranks;
        var thisRank = ranks[thisDoc._id];
        var query = Session.get("searchQuery");
        EventLogger.logSelectMatch(query, thisDoc, thisRank);
        allMatches.forEach(function(m) {
            logger.trace("This id: " + thisDoc._id);
            logger.trace("Current match id: " + m._id);
            logger.debug("Do they match? " + (m._id == thisDoc._id));
            if (m._id != thisDoc._id) {
                thisRank = ranks[m._id];
                EventLogger.logRejectMatch(query, m, thisRank);
            }
        });
    },
    'click .match-remove': function() {
        logger.debug("Clicked match remove button");
        logger.trace(this);
        MatchManager.removeMatch(Session.get("currentDoc"), this);
        EventLogger.logRejectPreviousSelection(this);
    },
})

var getMatches = function() {
    var allMatches = DocSearch.getData({
          transform: function(matchText, regExp) {
            return matchText.replace(regExp, "<b>$&</b>")
          },
          sort: {isoScore: -1}
        });
    var nonIdentityMatches = [];
    var ranks = {}
    var rank = 1;
    allMatches.forEach(function(m) {
        if (m._id != Session.get("currentDoc")._id) {
            nonIdentityMatches.push(m);
            ranks[m._id] = rank;
            rank += 1;
        }
    });
    var data = {'matches': nonIdentityMatches, 'ranks': ranks}
    return data;
}