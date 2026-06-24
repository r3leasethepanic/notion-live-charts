var charts={};
var fmtRub=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0});
var fmtNum=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
var C={grid:'rgba(148,163,184,.12)',text:'#f4f7fb',muted:'#94a3b8',green:'#4ade80',red:'#fb7185',blue:'#60a5fa',purple:'#a78bfa',cyan:'#22d3ee',amber:'#fbbf24'};
var chartColors=[C.blue,C.green,C.purple,C.cyan,C.amber,C.red,'#f472b6','#38bdf8'];
var lastPayload='';
var view=new URLSearchParams(location.search).get('view')||'dashboard';
var viewMap={monthly:'monthlyChart',category:'categoryChart',income:'incomeSourceChart',payer:'payerChart',type:'expenseTypeChart',required:'requiredChart'};
if(view!=='dashboard')document.body.classList.add('single-view');
function rub(v){return fmtRub.format(Math.round(Number(v||0)))}
function short(v){v=Number(v||0);if(Math.abs(v)>=1e6)return Math.round(v/1e6)+' млн';if(Math.abs(v)>=1e3)return Math.round(v/1e3)+' тыс';return fmtNum.format(v)}
function pct(v,t){return t?Math.round(Number(v||0)/t*100)+'%':'0%'}
function sum(o){return Object.values(o||{}).reduce((a,b)=>a+Number(b||0),0)}
function setText(id,t){var e=document.getElementById(id);if(e)e.textContent=t}
function status(t,err){var e=document.getElementById('status');e.textContent=t;e.classList.add('visible');e.classList.toggle('error',!!err)}
function clearStatus(){document.getElementById('status').classList.remove('visible','error')}
function rows(o,limit,other){limit=limit||7;if(other===undefined)other=true;var a=Object.entries(o||{}).filter(function(x){return Number(x[1])>0}).sort(function(x,y){return y[1]-x[1]});if(!other||a.length<=limit)return a.slice(0,limit);var top=a.slice(0,limit-1);var rest=a.slice(limit-1).reduce(function(s,x){return s+Number(x[1]||0)},0);if(rest>0)top.push(['Другое',rest]);return top}
function destroy(id){if(charts[id])charts[id].destroy()}
function makeChart(id,cfg){destroy(id);charts[id]=new Chart(document.getElementById(id),cfg)}
function activeView(){if(view==='dashboard')return;var id=viewMap[view]||'monthlyChart';document.querySelectorAll('.chart-card').forEach(function(c){c.classList.toggle('active-chart',!!c.querySelector('#'+id))})}
Chart.defaults.color=C.muted;Chart.defaults.borderColor=C.grid;Chart.defaults.font.family='Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
Chart.register({id:'centerText',afterDraw:function(chart,args,opt){if(!opt||!opt.text)return;var a=chart.chartArea;if(!a)return;var ctx=chart.ctx,x=(a.left+a.right)/2,y=(a.top+a.bottom)/2;ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=C.text;ctx.font='800 22px Inter,system-ui,sans-serif';ctx.fillText(opt.text,x,y-7);ctx.fillStyle=C.muted;ctx.font='600 10px Inter,system-ui,sans-serif';if(opt.subtext)ctx.fillText(opt.subtext,x,y+15);ctx.restore()}});
var baseOptions={responsive:true,maintainAspectRatio:false,animation:false,resizeDelay:120,interaction:{intersect:false,mode:'index'},plugins:{legend:{labels:{boxWidth:9,boxHeight:9,usePointStyle:true,color:C.muted,font:{size:11,weight:600}}},tooltip:{backgroundColor:'rgba(7,17,31,.96)',titleColor:C.text,bodyColor:C.text,borderColor:'rgba(148,163,184,.24)',borderWidth:1,padding:11,cornerRadius:12,displayColors:true}},scales:{x:{grid:{display:false},ticks:{color:C.muted,font:{size:11,weight:600}},border:{display:false}},y:{grid:{color:C.grid},ticks:{color:C.muted,font:{size:11,weight:600},callback:short},border:{display:false}}}};
function kpis(d){setText('totalIncome',rub(d.totals&&d.totals.income));setText('totalExpenses',rub(d.totals&&d.totals.expenses));setText('netBalance',rub(d.totals&&d.totals.net));setText('expenseCount',String((d.counts&&d.counts.expenses)||0));document.getElementById('netBalance').style.color=((d.totals&&d.totals.net)||0)>=0?C.green:C.red}
function insights(d){var exp=(d.totals&&d.totals.expenses)||0,inc=(d.totals&&d.totals.income)||0,net=(d.totals&&d.totals.net)||0;var cat=rows(d.expensesByCategory,1,false)[0],src=rows(d.incomeBySource,1,false)[0],pay=rows(d.expensesByPayer,1,false)[0],typ=rows(d.expensesByType,1,false)[0],req=rows(d.expensesByRequired,1,false)[0];setText('monthlyInsight',net>=0?'Период в плюсе: '+rub(net):'Период в минусе: '+rub(Math.abs(net)));setText('categoryInsight',cat?cat[0]+' · '+pct(cat[1],exp)+' трат':'Нет расходов');setText('incomeInsight',src?src[0]+' · '+pct(src[1],inc)+' доходов':'Нет доходов');setText('payerInsight',pay?pay[0]+' · '+pct(pay[1],exp)+' трат':'Нет расходов');setText('typeInsight',typ?typ[0]+' · '+pct(typ[1],exp):'Нет расходов');setText('requiredInsight',req?req[0]+' · '+pct(req[1],exp):'Нет расходов')}
