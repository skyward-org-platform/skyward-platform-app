## **Auto SEO Overview**

0:00  
Tricky Raffin, welcome back to the podcast. You wrote, "The key to any automatic SEO system has to be autotopic  
0:07  
and keyword research that has depth to it and automatic clustering. My keyword  
0:13  
universe has keywords flowing in via five different sources automatically. We  
0:18  
turn the scraped content into a vector database and my keyword agent looks at the data and generates seed keywords. We  
0:25  
use Google Search Console data. We scrape forums and scrape and analyze  
0:30  
product/service data and everything flows into the keyword universe. Data  
0:35  
gets populated and automatically clustered into topic groups. Then keyword groups get mapped to pages or  
0:42  
turned into new pages or removed if they are not relevant enough. All automatically incredible stuff really.  
0:50  
But nothing of this works without the AI brain that sits at the top and profiles  
0:55  
the business. So we have this is super cool that profiles the business. So we have a deep understanding of what they  
1:01  
want to sell, who their audience is and who they want their audience to be in the future. And so that is what you are  
1:08  
showing us on this episode of the show. Thank you again for coming back on. Yeah, thank you for having me. Looking  
1:15  
forward to going over this here. Right. Oh yeah. So yeah, um I last time we

## **Why Page Types Matter**

1:23  
spoke, I started building this system because I saw a lot of these automated SEO tools. And what they basically do is  
1:30  
they turn, you know, a content gap between your site and and a competitor into like a 30-day content calendar is  
1:37  
just on the blog side. But I wanted to build something that's maybe also takes  
1:42  
into account like what keywords you want to rank for, what topics you're missing and more importantly like what what is  
1:49  
the page type, you know, you want to have landing pages, you want to have tool pages, uh service,  
1:55  
not just blog posts. Everyone's just doing doing this for blog posts. Yeah, exactly. So, I just sat down and  
2:01  
started building that and and then this is what I came up with and I think it's pretty pretty awesome. But it starts

## **Brand DNA Brain**

2:07  
here with the like with the brand DNA and um we basically take like it has  
2:14  
like eight or nine sections and the agent I can talk to it here but it  
2:21  
basically profiles the business who your who is your like who's your um who's  
2:26  
your buyers who's your customers what do you want to what do you want to sell what products do you want to have and it  
2:32  
start populate your identity like your your voice and tone It takes all of your service pages and  
2:38  
builds out this section. So, this is specifically great for e-commerce. It like takes all of your products and just  
2:45  
builds them in here. Uh, you know, brand term, site structure. It just has a lot of things that you can build out. And  
2:52  
this allows us to have a section called keyword universe where it  
2:57  
just takes all of this data and starts discovering keywords and adding it into this section here. Right? So,

## **Keyword Universe Pipeline**

3:05  
wow. And we can talk about um automated SEO  
3:10  
because like when you're using chatbt or claw to do SEO, you're asking it  
3:16  
questions. Uh you're you're kind of missing a lot of the automated things that are important and that is you know  
3:22  
building a data pipeline. So that allows you to actually call you know with API  
3:29  
calls call href in a way you're you're like your error handling you're then storing that data and because you might  
3:35  
run into problems and things like that. So what what I wanted to build was something that stores the data and  
3:42  
allows you to crawl and and you know just build a universe around your keywords. So everything that we see here  
3:48  
is just fed in automatically basically and we can see um here's the source it  
3:54  
this one hasn't been been added on but we basically have AIC it finds that via  
4:01  
the brand DNA and if it finds a topic that it thinks is relevant it scores  
4:07  
that you know from zero to 100 and that way we can keep you know the the keyword  
4:13  
universe uh keep it you relevant to the business. You know, free local SEO tools  
4:19  
is not relevant to my business. Free SEO tools versus paid might not be and it  
4:25  
gives a reason here. So, we can then if we wanted to, I can go in and mark it as as relevant. But this keeps the  
4:31  
universe, you know, uh manageable. Okay. This method of marketing is so  
4:36  
effective, I had to make sure it wasn't against Google's rules before I kept doing it. It's a form of SEO I call  
4:42  
compact keywords. Whereas most SEO focuses on putting up articles to answer questions how, what, when, compact  
4:49  
keywords focuses on putting up dozens of pages that sell to searchers who are actually looking to buy. These pages  
4:57  
rank on Google and convert so much better than normal that when I discovered this years ago, I couldn't  
5:02  
believe this was allowed. It's less work, too. The average compact keywords page is only 415 words. Compact Keywords  
5:10  
is a 13-hour deep course on getting sales with SEO. A customer recently  
5:16  
said, "Each lesson is dense with information. You're giving years worth of experience boiled down into 15 to 30  
5:23  
minute lessons with no filler or fluff. I feel like I'm gaining a new superpower. Compact Keywords is about  
5:29  
setting up an SEO funnel that brings you sales for years and years and years. It  
5:35  
works with AI. It's less work than traditional SEO and it makes way more  
5:40  
money. You can get it now at compactkeywords.com. Back to the podcast.  
5:45  
What do you think? This is awesome. Um I'm I'm curious how  
5:50  
long it took you to make this and how how did you make it? What did you make it? Uh it's taking like four four months  
5:58  
something like that or pretty relentless. And yeah, four months just like day and  
6:06  
night pretty pretty intense. Gosh. Yeah. And but yeah, what it does  
6:14  
basically we built a a pipeline. So the first thing is discovery. So it goes and finds the relevant keywords. The second  
6:20  
part is it runs the the relevant score and the relevant keyword get the status  
6:26  
retained and then you have excluded. the ones that haven't run there, they're they're just uh it's called candidate  
6:33  
and and then it checks the SER it checks the volume and when we have done that it

## **Clustering Explained**

6:39  
start clustering them automatically and you start building out the keyword topic  
6:44  
clusters here right so and then you can see what keywords belong to digital marketing agency for example um because  
6:52  
I don't know if a lot of people understand why we're clustering the keywords so you might have a lot of keywords but they might belong to the  
6:59  
same page. So, Google's going to show the same page when you search for these different keywords and instead of like  
7:05  
looking at all of these different keywords, you just analyze the head term and all of the rest of the keywords just  
7:11  
sit there as member keywords basically, right? So, it starts clustering and it  
7:17  
creates these two because we ran into a few issues when we're autoclustering. It is like you create a cluster and then  
7:23  
you get more keywords and then you want to keep the cluster open. So we we  
7:29  
created something called singleton or or you know it's still open. We can get more keywords and that can get  
7:34  
populated. So this one has only one keyword. So we can actually go in and expand if we wanted to and it will find  
7:40  
more keywords to that topic and you know it just keeps the system dynamic and  
7:46  
yeah. Can you share um some results you've gotten with this so far?

## **Results and Human Review**

7:51  
Yeah. So, we have uh I can I I can share the specific I can show you off camera  
7:57  
spec specific site. Yeah. Yeah. But you could if you could talk about it. Yeah. You don't have to say the site.  
8:02  
Yeah. We have a pretty good keyword for a very competitive uh topic in the UK to  
8:07  
number one. And uh it's just basically a best article and a lot of supporting  
8:13  
content that that helps us rank for that. and it it's bringing in a lot of  
8:18  
sales for that business and it's a high ticket one so it's like average sale is like 8K so it's pretty good and  
8:26  
yeah it's and that was that was automatic or how much of that implementation was done by you  
8:32  
it's uh so the system is built in a way where you set things up and there is you  
8:39  
need a review state so I have a re review state here if I want to I can run this automatically as well Then so let

## **Command Center Workflows**

8:47  
me talk about this. So it it creates the clusters. It finds for example Shopify  
8:52  
SEO it found that we don't have a page for it. So it creates a page. So it it  
8:58  
that gets sent to something called command center where we have this playbooks. Uh all opportunities like you  
9:04  
have new keywords like this is a a topic it found. I can then play that. It gets wow.  
9:10  
Yeah. And then it gets sent down to mission controller. have agents that actually like write out the pages and  
9:16  
and Oh, cool. Yeah. So, yeah. So, like once this is  
9:21  
ready, it goes into neat review, right? We want to have uh we want to have our  
9:26  
review team take everything that that it creates review. Yeah. And it just goes over and says  
9:32  
like, "Yeah, these signals are correct. The content is good. Let's change this, add this, and then you get it uploaded  
9:37  
basically." And yeah, so it's it's it has human involvement definitely. You  
9:43  
don't want to run it automatically, but you can if you wanted to like just connect it to your store and just can  
9:48  
autopop populate all the the topics and keywords and but I think you need to have like a step in there that's that's  
9:56  
human. So you're not you're not doing scaled AI content with this. No, no, no. It's it's  
10:02  
I mean like agents and LLMs are very good at at you know uh finding signals,  
10:09  
right? you're we're taking all this data into the system from Google search console. We're taking, you know, all of  
10:14  
this keyword data, performance data, and we're turning uh our pages into embedded  
10:22  
vectors. So, we're we're vectorizing the the content, and all of that just helps us find signals. Okay, the agents are  
10:30  
good at interpreting the signals and deciding what needs to be done. But we create the playbooks. So we say like  
10:37  
this playbook should run when this happens. So when you have a topic that's in the top 20 is very good to analyze  
10:44  
the page find uh information gain uh look at missing entities and things like  
10:50  
that. So it goes and does that and that then you can go and review that right  
10:56  
that's that's the strength of the system is it like gives you the the data to analyze.

## **Intent and Commercial Focus**

11:02  
Yeah. What I what I thought was also really cool was the focus on uh commercial pages on on pages that were  
11:09  
meant to sell. Yes. Which you talked about, not just not just blog posts.  
11:14  
No, like I mean it just takes it just basically finds a lot of keywords and it  
11:19  
then analyzes the intent. So that's very important. when you have tools that just look at Google search console data for  
11:26  
example, it kind of forgets that you need to analyze and store the intent and  
11:31  
and it's good to track it over time because it can change and that's one of the signals you can have in the system  
11:37  
is that you know your your your intent changed so you need to review the content or like switch page and things  
11:43  
like that. Um yeah, I think it's pretty pretty awesome to be able to build this  
11:48  
just with AI. you use cloud to to make this? Uh yeah, cloud and codeex.  
11:55  
Awesome. Um do you have like a library? So you're doing this for a brand? Like let's say you set this up for a brand.

## **Images and Alt Text Automation**

12:03  
So what what does that look like in terms of how you how you learn  
12:09  
everything about the brand? Do you have like a library of images? So if you wanted to make like a product landing  
12:14  
page for example, like how does all of that what does that that whole workflow look like?  
12:20  
Yeah. So the the the landing page builder is not completely ready, but we  
12:27  
were using uh basically chatbt to to generate images and try and get the  
12:33  
brand you know copy of their their landing pages. So and then it's just human work to actually fill out the  
12:40  
content and add the images. But we're building the landing page like builder out so we can have it a little bit more  
12:47  
automated. Um but yeah, would you would you consider actually because like um when I when I make alt  
12:53  
text for articles, you know, probably a lot of people have way more sophisticated workflows. I just drag I  
12:59  
put the article into chatbt. I say I I have like specific file names for  
13:05  
images. Uh, and then I say write the alt text for these images  
13:12  
um using the file names and the article as context and it is like a very good  
13:17  
job. So would you do something would you ever think about doing something where you have the images and then you have  
13:24  
like every you have everything that you will that the system has learned about the business uh and then actually writes  
13:33  
really thorough alt text and and tags tags for images that would make it  
13:40  
really easy to insert them into relevant sales pages or articles.  
13:46  
Yeah, definitely. Uh we do that with like Shopify has some good apps that do  
13:51  
this. You just create these these uh templates and it runs it on all your files and just renames the the files and  
13:58  
and the you know add the right tag that's very descriptive that works really well. And we're building  
14:04  
something similar. We have the image and media library. So everything that we create for that brand, it gets stored  
14:10  
here and basically the the file names and everything as well. And then we use that in the the blog articles. So when  
14:17  
we have e-commerce clients uh their product images and things like that, we we feed that into the image module and  
14:25  
then we can rename and and do things like that. Definitely. Cool. And can you um can you show like

## **Project Brain Knowledge Base**

14:31  
how h like how detailed this goes into understanding a business?  
14:39  
So we can look at the so it for  
14:44  
you I recommend talking to a AI agent about your business when you're doing  
14:49  
something like the but I'm doing so brand I can I can basically talk to I  
14:54  
can I can tell questions um and it will  
15:00  
figure things out better than me. Okay. So it will research the the profile of my my buyers and things like that. So  
15:06  
you can talk to it and it will then fill out these sections much better than I  
15:11  
would be able to. So you have and then when you're because Claude is very good at taking brand identity and voice and  
15:19  
tone and breaking them down, you can actually do this like this as well. Um  
15:25  
so you have your brand story. Yeah. uh positioning, target audience,  
15:30  
what you sell. Then you have like trust signals and proof themes. And it just  
15:35  
starts filling all of these out. And you know, also have things like proof like  
15:41  
what are your case studies? It it just takes everything that you can find and builds it into the project. And when I'm  
15:48  
talking to the agent about this, it also fills out the project brain. So this is  
15:54  
uh a layer that's you know when you're talking to it and you say oh this isn't correct or we want to talk about this  
16:00  
topic or it it will fill that out as a knowledge. So it gives it a confidence  
16:06  
score. Um and things like this is an issue, this is working, this is  
16:11  
research, this is a preference, this is an actual strategy that I'm going to apply, this is insight, and it will just  
16:17  
fill this out. And when I'm talking to the agents that are within the system, for example, if I go to the keyword  
16:23  
universe, I can open this up and we can say something like I need more keywords  
16:31  
about Yeah. something like keywords from href  
16:36  
about AGNC SEO and it will you know help me  
16:43  
find those keywords look at different you know it will look at the brand DNA  
16:48  
and try and find more keywords that are missing from the unit. Wow. Wow. Yeah. Here we go. So,  
16:55  
discovery summary fetss from href sue agency like it will just not everything  
17:02  
is is perfect especially when I'm fetching from href. It's it's better when I just have the AI workflow go but  
17:08  
we now have 79 new keywords added in here that we can then analyze. So, I can  
17:15  
go here and we can sort it like this is a  
17:21  
Yeah. So and then it will just go and find the volume check the relevance and  
17:27  
you know it just loops through increase the these clusters and then you can analyze like is this cluster relevant to  
17:32  
my business or not and you can you know um build the page optimize and you can  
17:38  
also run things like striking distance um find information gain and things like  
17:43  
that so I think it's very good but how are you finding how are you finding information gain

## **Information Gain Briefs**

17:49  
um yeah when we have when we have keywords that sit in the top 20\. We  
17:54  
create something called I can just show you here. Hold on.  
18:00  
It creates I'm also I'm also I'd like to hear about how you scrape forums. Uh and then yeah,  
18:07  
I mean you talked about how you analyze the product service data, but scraping forums is really interesting too.  
18:12  
Yeah. So that's more about like finding like pain points within the articles. So it will take scrape the forums and  
18:19  
obviously add that to keyword universe and you can do the same with things like  
18:24  
uh AI SEO when you're trying to find like prompts and things like that it it gets added as a topic inside a cluster.  
18:32  
So we have uh yeah for example here let's take a look at  
18:38  
so we run this vitamins. Yeah. So we run this as a it's it's ranking like 13 or 14 or something and  
18:45  
it will take and analyze the top 10\. It will find gaps basically like what  
18:52  
topics are not covered, what topics are like engineering. Uh it will just run all of these  
18:58  
different things and find and create this research brief. So, and we'll just  
19:03  
tell it like this pa solid structural bones product picks and then just it goes into what's missing like no buying  
19:10  
guide section how to do section is missing no FAQ section and it will run  
19:16  
through all of these things and let me just go back here and then it  
19:23  
will fetch SEO intel rules so basically find entities that  
19:30  
and then it will update the content from a a clean source. It scrapes it and then  
19:35  
creates a new brief new article with all of this information and yeah, it it  
19:41  
creates a pretty good article I think from that. Yeah, that's sick. Um, so this is Yeah,

## **Backlog to Review Workflow**

19:46  
I wanted to see the screen. So this is so you so what what does it start with? If you if you scroll to the left, if you  
19:53  
go to the left Yeah. So you have the backlog. There we go. And so this is so this is  
20:01  
basically to-do. Why doesn't it just run on its own? Uh so these are items that are we don't  
20:08  
have a workflow for them. I was just playing around. So they're just stuck. And when I create manual tasks for my  
20:15  
team, it will go into backlog. And then someone will just basically take them and they will go into progress. And if I  
20:22  
want to create just hold on. If I want to create a  
20:29  
switch task I can just create an article from just writing out something just  
20:34  
best SEO agency that will go  
20:41  
let's just have a buying guide uh that will get added  
20:46  
here as as cued right and then how long will it take to to do all the research and to write the to  
20:52  
write the content? Yeah, it can take like from 20 minutes. Oh man.  
20:58  
Yeah, up to like an hour. Depends on how how much content is cued in the in the system. Um the this agent here, he just  
21:07  
basically the the project manager, he'll send it into progress and you can see now uh resources starting. So states is  
21:16  
the resources you're working on task 1639 and that's basically these are what we  
21:23  
call stateless su like stateless agents they don't have a uh like open claw is  
21:30  
stateful agent like he has memory um context he has like a mission but these  
21:37  
are just agents that wake up do a task and then they go back to sleep so it's a basically a pipeline that runs  
21:46  
Can we see Can we go through a um one of the needs review ones or is that like too sensitive?  
21:52  
These are just everything here is just tests data. I'm just Oh, great. Yeah. So, could So, like I I  
21:58  
want to know like what it looks like when you're reviewing one of these pieces and then what  
22:03  
um what makes it into the next stage and then what gets blocked. Yeah. So we have obviously different  
22:10  
workflows for different uh projects like this one is just very very uh normal. It  
22:16  
just writes it sends to review and I can just open this article up in the editor  
22:23  
and it has a editor that shows the content and I can tag it with a team  
22:28  
member that's going to go in and review it. Wow. And yeah and then we can just hit approve or we can  
22:36  
uh send it for further review like we can do like I mean I can do a a comment  
22:41  
on it and say like I'm not happy with this. Yeah. So they will basically go and and fix it add images and and it is  
22:49  
just goes through the pipeline very fast and you can just switch uh you can  
22:54  
switch topics here on the left if you wanted to. How much time do you think this is  
23:00  
saving your team? Yeah, a lot. Like it's insane. Um, but everything like having  
23:06  
everything in one place like you have all of the HF data, you have all of the keywords, you have all the clustering,  
23:12  
you have all of the content, you have all the Google search console, you have everything in one place and images and  
23:18  
it just saves so much time to be able to push all of this content through the system very fast and you don't have to  
23:24  
think about like, oh, I have to go and do spend two hours doing like all of this research. Agents are really good at  
23:30  
doing research. They're doing very good at finding gaps. They're very good at, you know, finding information gain, uh,  
23:36  
finding missing entities. And so your work is actually to take that and just, you know, make sure it's good. You don't  
23:42  
have to go and spend all of this time doing the research yourself. And yeah, but I can go back here.  
23:52  
Yeah, if it's not frozen because Yeah,  
23:57  
I'm pushing a lot of updates, so it tends to  
24:03  
But yeah, so what are you what are you wait what are you trying to show us? I was going to go back to mission control. There we go.  
24:10  
Yeah, I was going to show you the So we have this one is now building out. I can  
24:15  
go into deliverables and we can see uh this is just a brief of what the  
24:20  
resource is is looking at. So they're looking at all of these different pages is uh is is analyzing the content. It's  
24:27  
analyzing the entities. it's looking at and giving the next uh the writing agent  
24:34  
all of this information when they write the article. So So you had to design all of these  
24:40  
workflows yourself. Yeah. So yeah, basically from scratch  
24:46  
and not all of them are ready, but we have like 12 workflows that are running  
24:51  
through pretty good. Um yeah. And then can you talk about the writing workflows? This is something that I

## **Writing Quality Controls**

24:57  
think trips a lot of people up and they turn out really terrible AI content. So what makes your AI content better?  
25:05  
First of all, we have a review stage. So we're not just having it write it where  
25:10  
we're actually putting it into the hands of a human. Um number two, we we have a  
25:15  
a pipeline. So it goes and takes all of this research and we then when we are  
25:22  
not happy with the content we go in and we update the system and we end up with  
25:28  
content that we are happy with for that specific page type basically. So uh in  
25:34  
the beginning I was not happy with the buying guides. Uh they had a lot of AI things in them. So we're iterating we're  
25:42  
talking to uh the system telling them like how we want it to done and so it  
25:47  
updates the workflows but also specifically for each project we have the the brain you know that I showed  
25:53  
before where it's like a preference it stores that so this project does not want this specific type of of you know  
26:01  
writing or or structure and then they listen to that  
26:07  
and Uh, so this is internal for your team only. Would you ever open up something like this for other people to  
26:13  
use? Yeah, I might in the future. I don't know if if there's enough demand or  
26:19  
something and like isn't the the system isn't uh I wouldn't say it's ready just  
26:25  
yet. There's a lot of things that I need to fix before I would open it up. But uh I would definitely be open to allowing a  
26:32  
few people I trust to play around so they can give me feedback. Uh but you know actually another interesting

## **Building Lessons and Roadblocks**

26:38  
question is for people who want to make uh for SEOs and marketers who want to make something like this themselves.  
26:45  
What are what were the biggest roadblocks when you started or the things that you spent the most time on  
26:51  
iterating and the the biggest lessons that you had making this?  
26:56  
Yeah. So the first thing was just to learn how to actually write code with  
27:01  
with agents. I don't know how like I've never learned how to code. is not one of the things I know how to do. And I was  
27:08  
playing around with with open claw, you know, claw claw uh the the open claw  
27:14  
agent, you know that? Yeah. Yeah. Okay. So, it's an agent basically that you install on your computer that  
27:20  
has like it has memory, has context, and you can give it like a mission and it's like very proactive. It will use your  
27:26  
computer, will browse like it didn't delete all your emails or anything? No. So, I bought a new computer. I set  
27:32  
up a new email and everything. I did. Okay. Yeah. Great. You know what you're doing. Yeah. Yeah. I didn't have it messing  
27:37  
around in my my work computer, but what it like it started building tools. I was like blown away what it was was  
27:44  
creating. And uh the first thing it created was actually this mission control. And it like started building  
27:51  
out sub agents. I was like, okay, this is pretty incredible. So, but I figured  
27:56  
out that it isn't actually very good at writing good code. like it will not  
28:04  
uh review the code like things started to break basically. So I started building out a system where I write the  
28:10  
code but I get the ideas and things from like talking to the agents and they helped me just organize stay on top of  
28:16  
things. So error handling uh is like critical you if you want to go and and  
28:22  
and wipe code something like this you have to have a system where it's just everything that you upload goes through  
28:27  
a phase where it's just is gated. some of it needs to go back like and fix this. So that was the first thing I had  
28:34  
to learn. H I created this platform like four times before learning that and it just broke down every time I tried to  
28:40  
like scale something or like add a feature. So that was like the biggest thing was to learn how to do that and  
28:47  
yeah I recommend learning that first. Then it was actually right like creating the the content pipeline was like very  
28:55  
very difficult to get everything to flow from one stage to the next. So it  
29:00  
doesn't break. Um you know you have an agent that does this. It hands work over to this agent but this agent has to use  
29:07  
the entities in the right way. Sometimes the the scraped entities are not correct and that agent has to realize that. So  
29:14  
it's just a little bit back and forth. Um so we have spent a lot of time on  
29:20  
this you know the content system and then is the the all the keywords and clustering has been very difficult to  
29:26  
get right because when you're auto mapping you're auto creating topics you  
29:32  
have to have a way for the agents to understand you know like these are the pages that you have these are the  
29:38  
intents um and like get everything right there was very difficult but you know we  
29:44  
we were very close to having that pretty uh pretty automatically right  
29:50  
now. Yeah. And you you also said so um you mentioned that the keyword universe has

## **Five Keyword Sources**

29:56  
keywords flowing in via five different sources automatically. So it's hrefs. It's it's what like forums, Google  
30:03  
search console data. Yeah. Uh it is. So we create the first  
30:09  
thing we do is we when we add a project is we create and  
30:14  
feed all of the the the topics. So it scrapes your store or or your your your site and it then feeds all of the search  
30:23  
console data into this place. So and that means you can try out uh errors, you can look at performance data, but  
30:30  
you can also have fixed topics on a page. So this page is this topic. This  
30:36  
page is this topic. This is the one we created before. Um yeah. So it it takes  
30:41  
everything that's on these pages and it creates a vector database. Okay. So vector database is it takes the content  
30:48  
and turns it into numerical values. So instead of having words, you just have numbers and that's uh like LLMs are very  
30:56  
good at interpreting that data and it can then guess what the topic is very easily. So uh it will take my current  
31:04  
page and it will guess the seat. How how hard how hard was it to turn to  
31:12  
have something that turns this into a vector database like for you to do that? It was very easy like uh um the coding  
31:20  
agent can do that quite easily. It's it's not difficult when you have all of the other uh like pipelines in place.  
31:26  
You have all of the like you have created your data warehouse. You have created all the the pipelines. is very  
31:32  
easy to that function was very easy. Um yeah, so it just basically will use a  
31:39  
cosine similarity function to like find what it thinks should that page is about and it will see that into the universe  
31:46  
and that is very good when you have products service pages because you will get uh you know you'll get these  
31:52  
commercial intent keywords into the universe that helps you then you know  
31:57  
seed out pages that are about that and yeah so that's that would be be be one  
32:04  
uh the number let me go back to the universe. So number two is just the agents looking at the keywords that you  
32:10  
have that have high relevant score and if I click this it will go and add more  
32:15  
but the agent will do this on a like a cron uh like on a schedule it will just  
32:20  
go and add more keywords that are relevant and that will then go through the same pipeline. check the relevance,  
32:27  
check check the SER, check the volume and then cluster it and then yeah, if  
32:32  
you scrape forums, we we use href data for SEO and yeah, basically everything  
32:39  
that we can to get more volume into the the keyword universe. So we can have  
32:44  
like a a broad keyword database that we then narrow down with with the relevant  
32:51  
score and the the clustering. And so you you said this has saved your team a ton of time. Has it also made any

## **Impact on Rankings**

33:00  
sort of difference on results? Yeah, it definitely has. Um, we can now  
33:06  
very quickly get these, like I showed you before, the striking distance report, you know, when you have a report  
33:12  
like that on a page, you can very quickly go and update it and it will rank much faster into the top 10 when  
33:19  
you go and apply these changes. They're very good, these changes. Um, you know, I also just all of these tools now they  
33:26  
love like fresh content and just by being able to go in and quickly update content, you have a lot of fresh content  
33:33  
going and and we have seen that across multiple project that that's really really um helps the sites get more  
33:41  
traffic quite fast. I think let's go. This is this is great. Thank  
33:46  
you for showing this to us. Uh are before we go, are there any other any other awesome things that you should

## **Wrap Up and Next Features**

33:53  
show us? I I think uh everything I showed you today is is pretty pretty cool and that's the  
33:58  
the you know this is central things of this tool. I'm also building out things like um you know how I have a domain  
34:06  
finder. I don't want to show it but it will basically find we'll use your brand DNA to find available domains for your  
34:13  
business if you want to buy them. uh so you can find like brandable domains and every time I get an idea I'll just build  
34:19  
it and add it to the tool basically. So um yeah then we building out things for  
34:24  
the agency to track work and things like that that I don't think is relevant right now but yeah I think I think this  
34:31  
is the the main thing is the keyword universe and the the command center and mission control to like have everything  
34:38  
just flow through. Thank you so much Trickvy. Um, all of your socials and your contact will be in  
34:44  
the description for this episode like it was last time. And uh, dude, you are you  
34:50  
are great. And you're welcome back on any time to to show what you're working on. This is so this is so sick.  
34:56  
Thank you for having me. Love being here. Uh, great to to show this. And if people have questions about how to get  
35:02  
started building things or or SEO, just go ahead. You can find me on Twitter.  
35:07  
This is episode 1,027 of the Edward Show. 1,027  
35:14  
days in a row doing this podcast. No days missed. If you watch us on YouTube,  
35:21  
thank you so much for watching. You probably didn't listen on Spotify or Apple Podcast because this was a screen  
35:26  
shareheavy episode, but if you did, thank you so much for listening and I will talk to you again tomorrow. Bye  
35:33  
now.  
