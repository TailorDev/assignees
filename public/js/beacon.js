(function(e, o, n) {
  window.HSCW = o, window.HS = n, n.beacon = n.beacon || {};

  var t = n.beacon;
  t.userConfig = {}, t.readyQueue = [], t.config = function(e) {
    this.userConfig = e
  }, t.ready = function(e) {
    this.readyQueue.push(e)
  }, o.config = {
    docs: {
      enabled: false,
      baseUrl: ""
    },
    contact: {
      enabled: true,
      formId: "d6ab6d89-eaf4-11e6-8789-0a5fecc78a4d"
    }
  };

  var r = e.getElementsByTagName("script")[0],
    c = e.createElement("script");

  c.type = "text/javascript";
  c.async = true;
  c.src = "//djtflbt20bdde.cloudfront.net/";
  r.parentNode.insertBefore(c, r);
})(document, window.HSCW || {}, window.HS || {});

HS.beacon.config({
  color: '#2ac5ee',
  icon: 'message',
  topics: [
    { val: 'needs-help', label: 'I need some help' },
    { val: 'feature-request', label: 'I would like to suggest a feature' },
    { val: 'feedback', label: 'I would like to leave feedback' },
    { val: 'bug', label: 'I think I found a bug'},
    { val: 'other', label: 'Other'}
  ]
});
