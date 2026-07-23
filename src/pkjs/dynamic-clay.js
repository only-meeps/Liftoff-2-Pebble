module.exports = function(minified) {
  var clayConfig = this;

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    var wkutToggle = clayConfig.getItemById('hourlySelectToggle');
    var hourlySelect = clayConfig.getItemById('hourlySelect');

    function toggleDailyWKUT() {
      if (wkutToggle.get()) {
        hourlySelect.disable();
      } else {
        hourlySelect.enable();
      }
    }

    wkutToggle.on('change', toggleDailyWKUT);
    toggleDailyWKUT();
  });
};