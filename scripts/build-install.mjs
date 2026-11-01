import { readFileSync,readdirSync,writeFileSync } from 'node:fs';
const root='supabase/migrations';
const files=readdirSync(root).filter(f=>f.endsWith('.sql')).sort();
writeFileSync('supabase/install.sql','-- Sellora AI: installation initiale sur un projet sans tables Sellora.\n-- Généré depuis supabase/migrations ; aucune clé incluse.\nbegin;\n'+files.map(f=>'\n-- '+f+'\n'+readFileSync(`${root}/${f}`,'utf8')).join('')+"\nnotify pgrst, 'reload schema';\ncommit;\n");
