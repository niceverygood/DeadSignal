// Display materials only. World data, collision and saved runs retain their original values.
const rows={
  demolition:['#21313b','#2b3c47','#55616a','#515b61','#3a4a55','#243540'],
  sewers:['#1e302e','#263e3b','#4c6660','#465b56','#314943','#17352f'],
  harbor:['#1c2e3c','#294052','#526c78','#4a606c','#304956','#20384a'],
  hospital:['#263737','#314847','#637a73','#63766e','#405952','#26453e'],
  checkpoint:['#222f3f','#2c3e51','#5e6c7a','#4e606f','#354957','#21384d'],
  terminal:['#263339','#34434a','#667174','#59635f','#3b4c55','#263a44'],
  power:['#233241','#304255','#667a8c','#4d6372','#334959','#223c54'],
  refinery:['#273339','#36464b','#66726f','#665951','#434b4d','#263940'],
  armory:['#243334','#324442','#62716a','#586354','#3b4b45','#243c37'],
  scrapyard:['#263238','#33434a','#626c70','#635a55','#3b4b54','#283a43'],
  greenhouse:['#223430','#2e4540','#617568','#586857','#3c5147','#223d34'],
  breakwater:['#1b2e3e','#284255','#5a7383','#4b6472','#324c5b','#1c3950'],
  residential:['#223139','#2c3c44','#54656c','#535c61','#344650','#223742'],
  commercial:['#21313b','#2d3e49','#586b75','#4d616c','#334955','#243a48'],
  station:['#21313c','#2b3e4b','#5a6f7b','#526471','#344b5a','#233c50'],
};
const fields=['asphalt','road','curb','wall','roof','fog'];
const themes=Object.freeze(Object.fromEntries(Object.entries(rows).map(([theme,values])=>[theme,Object.freeze(Object.fromEntries(fields.map((field,i)=>[field,values[i]])))])));
export function visualMaterials(world){return {...world?.palette,...themes[world?.theme||'residential']};}
