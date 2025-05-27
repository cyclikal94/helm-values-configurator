the values schema needs:
    - description
    - enforce oneOf requirements if applicable
    - defaults
    - extraEnv is array, should it not be key/value (i.e. Object?)
    - required (surely serverName is a required field?)


todo
- [ ] warn / figure out oneOf fields
- [ ] for some reason the default label appears on empty arrays. but after adding array items / removing, the label works as intended.
- [ ] make it so that the required * icon only appears if you have actually directly specified anything within the associated section
    - [ ] required icon should show up for array items
- [ ] key/value pairs!?
- [ ] Sort defualt tags for arrays (/ probably all other complex types)

the big one:
- [ ] have the UI update the YAML
    - this should hopefully be better than previous attempt as the YAML is very specific in it's updates to the UI.
    - need to make this the same going from Form to YAML, very specific updates