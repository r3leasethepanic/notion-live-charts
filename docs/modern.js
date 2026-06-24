(function(){
  function add(src, done){
    var s=document.createElement('script');
    s.src=src+'?v=3';
    s.onload=done;
    s.onerror=function(){
      var app=document.getElementById('app');
      if(app) app.innerHTML='<section class="loader">Не загрузился файл '+src+'</section>';
    };
    document.body.appendChild(s);
  }
  add('./modern-core.js', function(){ add('./modern-charts.js', function(){}); });
})();
