import {runHarborPowerQA} from '../work/dead-signal-game/dist/qa-harbor-power.js';
const seed=Number(process.argv.find(a=>a.startsWith('--seed='))?.split('=')[1]||774);
const {report}=await runHarborPowerQA({seed,isolated:!process.argv.includes('--combat')});
console.log(JSON.stringify(report));if(!report.result?.won)process.exitCode=1;
