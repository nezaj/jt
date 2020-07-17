import React from "react";
import "./App.css";
import { withRouter } from "react-router";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Link,
  NavLink,
} from "react-router-dom";
import * as firebase from "firebase/app";
import { loadStripe } from "@stripe/stripe-js";
import marked from "marked";
import { Form, Input, Button, Spin, Modal, message } from "antd";
import { LoadingOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import howWasYourDayImg from "./images/step-how-was-your-day.png";
import summaryImg from "./images/step-summary.png";
import inviteFriendsImg from "./images/step-invite-friends.png";
import qs from "qs";

// Set up Firebase
import "firebase/auth";
import "firebase/database";
firebase.initializeApp({
  apiKey: "AIzaSyCBl-YAARDZuf0KcTIOTcmUZjynaKC7puc",
  authDomain: "journaltogether.firebaseapp.com",
  databaseURL: "https://journaltogether.firebaseio.com",
  projectId: "journaltogether",
  storageBucket: "journaltogether.appspot.com",
  messagingSenderId: "625725315087",
  appId: "1:625725315087:web:a946ce7cf0725381df2b7a",
  measurementId: "G-GYBL76DZQW",
});

const STRIPE_PK =
  process.env.NODE_ENV === "production"
    ? "pk_live_erHEE5TRgYAlgqMkadDK7zmA"
    : "pk_test_1iGrM3ZC85K4LbvyaphPMBr6";

const stripePromise = loadStripe(STRIPE_PK);

function serverPath(path) {
  const root =
    process.env.NODE_ENV === "development" ? "http://localhost:8080" : "";
  return `${root}/${path}`;
}

function FullScreenSpin({ message }) {
  return (
    <div className="Full-Screen-Loading-container">
      <div className="Full-Screen-Loading">
        <Spin
          tip={message}
          indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}
        />
      </div>
    </div>
  );
}

class SignIn extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasRequestedCode: false,
    };
  }
  componentDidMount() {
    this._emailInput && this._emailInput.focus();
  }
  render() {
    const { hasRequestedCode } = this.state;
    if (hasRequestedCode) {
      return (
        <div className="Sign-in-success-container">
          <div className="Sign-in-success">
            <h1 className="Sign-in-success-title">📝 journaltogether</h1>
            <h2 className="Sign-in-success-sub">Check your mail 😊</h2>
            <p className="Sign-in-success-content">
              Oky doke, you should receive an email from journal-signup. Click
              the link in there to login
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="Sign-in-root">
        <div className="Sign-in-header-and-form">
          <div className="Sign-in-header">
            <h1 className="Sign-in-header-title">📝 journaltogether</h1>
            <h2 className="Sign-in-header-sub">Let's get you signed in</h2>
            <p className="Sign-in-header-content">
              Enter your email, and you'll receive a magic link to sign in
            </p>
          </div>
          <div className="Sign-in-form">
            <Form
              onFinish={({ email }) => {
                this.setState({ hasRequestedCode: true });
                fetch(serverPath("api/magic/request"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                })
                  .then((x) =>
                    x.status === 200 ? x.json() : Promise.reject(x.json())
                  )
                  .catch(() => {
                    message.error(
                      "Oh no, something broke. Please try sending the magic link again"
                    );
                    this.setState({
                      hasRequestedCode: false,
                    });
                  });
              }}
            >
              <Form.Item
                name="email"
                rules={[{ required: true, message: "Please enter your email" }]}
              >
                <Input
                  className="Sign-in-form-input"
                  type="email"
                  placeholder="Enter your email"
                  size="large"
                  ref={(ref) => {
                    this._emailInput = ref;
                  }}
                />
              </Form.Item>
              <Form.Item>
                <Button
                  className="Sign-in-form-submit-btn"
                  size="large"
                  type="primary"
                  htmlType="submit"
                >
                  Send me a magic code 🚀
                </Button>
              </Form.Item>
            </Form>
          </div>
        </div>
      </div>
    );
  }
}

class ProfileHome extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isLoadingGroups: true,
      isLoadingSchedule: true,
      idToGroup: {},
      schedule: null,
    };
    this._idToGroupRef = {};
    this._userGroupIdsRef = firebase
      .database()
      .ref(`/users/${firebase.auth().currentUser.uid}/groups`);
    this._inviteFormRefs = {};
  }
  componentDidMount() {
    fetch(serverPath("api/me/schedule"), {
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((x) => {
        return x.status === 200 ? x.json() : Promise.reject(x.json());
      })
      .then((schedule) => {
        this.setState({ schedule, isLoadingSchedule: false });
      })
      .catch((e) => {
        message.error(
          "Uh oh, I wasn't able to find your schedule. May be an intermitent bug"
        );
      });
    // groups
    const updateGroups = (f) => {
      this.setState(({ idToGroup }) => ({
        isLoadingGroups: false,
        idToGroup: f(idToGroup),
      }));
    };
    const onGroup = (snap) => {
      updateGroups((oldGroups) => ({ ...oldGroups, [snap.key]: snap.val() }));
    };

    const removeStrayGroupIds = (groupIdSet) => {
      for (let [k, ref] of Object.entries(this._idToGroupRef)) {
        if (groupIdSet.has(k)) {
          continue;
        }
        ref.off();
        delete this._idToGroupRef[k];
      }
    };
    const listenToNewGroupIds = (groupIdSet) => {
      groupIdSet.forEach((groupId) => {
        if (this._idToGroupRef[groupId]) return;
        const newRef = firebase.database().ref(`/groups/${groupId}/`);
        newRef.on("value", onGroup);
        this._idToGroupRef[groupId] = newRef;
      });
    };
    this._userGroupIdsRef.on("value", (snap) => {
      const groupIdSet = new Set(Object.keys(snap.val() || {}));
      if (groupIdSet.size === 0) {
        this.setState({ isLoadingGroups: false });
      }
      removeStrayGroupIds(groupIdSet);
      listenToNewGroupIds(groupIdSet);
    });
    this._userGroupIdsRef.on("child_removed", (snap) => {
      const groupId = snap.key;
      if (!this._idToGroupRef[groupId]) return;
      this._idToGroupRef[groupId].off();
      delete this._idToGroupRef[groupId];
      updateGroups((oldGroups) => {
        const res = { ...oldGroups };
        delete res[groupId];
        return res;
      });
    });
  }

  componentWillUnmount() {
    this._userGroupIdsRef.off();
    Object.values(this._idToGroupRef).forEach((ref) => ref.off());
  }

  render() {
    const {
      idToGroup,
      isLoadingGroups,
      isLoadingSchedule,
      schedule,
    } = this.state;
    if (isLoadingGroups || isLoadingSchedule) {
      return <FullScreenSpin />;
    }
    const groupEntries = Object.entries(idToGroup || {});
    return (
      <div className="Profile-container">
        {schedule && schedule["reminder-ms"] && (
          <div className="Profile-schedule-container">
            <h2 className="Profile-schedule-title">
              Your next reminder:{" "}
              <span className="Profile-schedule-reminder-date">
                {new Date(schedule["reminder-ms"]).toLocaleString("en-US", {
                  weekday: "long",
                  hour: "numeric",
                  minute: "numeric",
                })}
              </span>
            </h2>
            <p className="Profile-schedule-desc">
              🙌 Welcome. Watch your email around{" "}
              {new Date(schedule["reminder-ms"]).toLocaleString("en-US", {
                weekday: "long",
                hour: "numeric",
                minute: "numeric",
              })}
              . You'll receive an email from Journal Buddy, asking about your
              day. We'll record your answers as journal entries. Don't want to
              wait? Simply send an email to{" "}
              <a
                href="mailto:journal-buddy@mg.journaltogether.com"
                target="_blank"
              >
                journal-buddy@mg.journaltogether.com
              </a>
              , and you can log right away
            </p>
          </div>
        )}
        {groupEntries.length > 0 && (
          <div className="Profile-groups-container">
            <h2 className="Profile-groups-title">Your groups</h2>
            {groupEntries.map(([k, g]) => {
              return (
                <div className="Profile-group">
                  <div className="Profile-group-header">
                    <h3 className="Profile-group-header-title">{g.name}</h3>
                    <Button
                      className="Profile-group-header-btn"
                      type="default"
                      onClick={() => {
                        Modal.confirm({
                          icon: <ExclamationCircleOutlined />,
                          title: "Are you absolutely sure?",
                          content: (
                            <p>
                              You're about to this group. This group will
                              disappear for all invited members
                            </p>
                          ),
                          okText: "Yes, delete this gorup",
                          okType: "danger",
                          onOk() {
                            const userKeysToDelete =
                              (g.users &&
                                Object.keys(g.users).reduce((res, uk) => {
                                  res[`/users/${uk}/groups/${k}`] = null;
                                  return res;
                                }, {})) ||
                              {};
                            firebase
                              .database()
                              .ref()
                              .update({
                                [`/groups/${k}`]: null,
                                ...userKeysToDelete,
                              });
                          },
                        });
                      }}
                    >
                      Delete Group
                    </Button>
                  </div>
                  <div>
                    {g.users && (
                      <div className="Profile-group-users-container">
                        <h4 className="Profile-group-users-title">Members</h4>
                        {Object.entries(g.users).map(([uk, u], i, arr) => {
                          return (
                            <div className="Profile-group-user" key={u.email}>
                              <p className="Profile-group-user-title">
                                {u.email}
                              </p>
                              {arr.length > 1 && (
                                <Button
                                  className="Profile-group-user-remove-btn"
                                  onClick={() => {
                                    Modal.confirm({
                                      icon: <ExclamationCircleOutlined />,
                                      title: "Are you absolutely sure?",
                                      content: (
                                        <p>
                                          You're about remove a user from this
                                          group. This can't be undone
                                        </p>
                                      ),
                                      okText: "Yes, remove this user",
                                      okType: "danger",
                                      onOk() {
                                        firebase
                                          .database()
                                          .ref()
                                          .update({
                                            [`/groups/${k}/users/${uk}`]: null,
                                            [`/users/${uk}/groups/${k}`]: null,
                                          })
                                          .catch((e) => {
                                            message.error(
                                              "Uh oh, I was not able to delete this group. Please try again"
                                            );
                                          });
                                      },
                                    });
                                  }}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="Profile-group-invite-user-container">
                    <h4 className="Profile-group-invite-user-title">
                      Invite your friends
                    </h4>
                    <p className="Profile-grop-invite-user-content">
                      Want to add friends to {g.name}? Give us their email and
                      we'll ask them to join!
                    </p>
                    <Form
                      ref={(x) => {
                        this._inviteFormRefs[k] = x;
                      }}
                      onFinish={({ email }) => {
                        this._inviteFormRefs[k] &&
                          this._inviteFormRefs[k].resetFields();

                        const invitationRef = firebase
                          .database()
                          .ref("/invitations")
                          .push();

                        message.success(
                          "Oky doke, we're sending your friend an invitation!"
                        );
                        invitationRef
                          .set({
                            "sender-email": firebase.auth().currentUser.email,
                            "receiver-email": email,
                            "group-id": k,
                          })
                          .then(() => {
                            fetch(serverPath("api/me/invite-user"), {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                "invitation-id": invitationRef.key,
                              }),
                            }).then((x) => {
                              return x.status === 200
                                ? x.json()
                                : Promise.reject(x.json());
                            });
                          })
                          .catch(() => {
                            message.error(
                              "Uh oh, we couldn't send this invitation. Please try again"
                            );
                          });
                      }}
                    >
                      <Form.Item
                        name="email"
                        rules={[
                          {
                            required: true,
                            message: "Let us know your friend's email",
                          },
                        ]}
                      >
                        <Input
                          className="Profile-group-input"
                          placeholder="Your friend's email: i.e super-cool-joe@gmail.com"
                          size="large"
                          type="email"
                          suffix={
                            <Button
                              className="Profile-group-submit-btn"
                              size="large"
                              type="primary"
                              htmlType="submit"
                            >
                              Invite your friend
                            </Button>
                          }
                        />
                      </Form.Item>
                    </Form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="Profile-create-group-container">
          <h2 className="Profile-create-group-title">
            {groupEntries.length === 0
              ? "Create your first group"
              : "Create more groups"}
          </h2>
          <div className="Profile-create-group-content">
            {groupEntries.length === 0 ? (
              <div className="Profile-create-group-empty-content">
                You're now able to journal by yourself. Buut, if you like, you
                can journal with your friends! To do that, you need to create a
                group.
              </div>
            ) : (
              <div className="Profile-create-more-groups-content">
                You already have a group, and can invite friends there. However,
                if you want to have updates with multiple friend groups, you can
                create more groups
              </div>
            )}
          </div>
          <Form
            ref={(x) => {
              this._createGroupForm = x;
            }}
            onFinish={({ groupName }) => {
              this._createGroupForm.resetFields();
              const groupKey = firebase.database().ref("/groups/").push().key;
              const uid = firebase.auth().currentUser.uid;
              const email = firebase.auth().currentUser.email;
              firebase
                .database()
                .ref()
                .update({
                  [`/groups/${groupKey}/name`]: groupName,
                  [`/groups/${groupKey}/users/${uid}/email`]: email,
                  [`/users/${uid}/groups/${groupKey}`]: true,
                });
            }}
          >
            <Form.Item
              name="groupName"
              rules={[
                { required: true, message: "Think up a name for your group" },
              ]}
            >
              <Input
                className="Profile-group-input"
                placeholder="Name your group: i.e The Fam"
                size="large"
                ref={(ref) => {
                  this._groupNameInput = ref;
                }}
                suffix={
                  <Button
                    className="Profile-group-submit-btn"
                    size="large"
                    type="primary"
                    htmlType="submit"
                  >
                    Create a group 🚀
                  </Button>
                }
              />
            </Form.Item>
          </Form>
        </div>
      </div>
    );
  }
}

class JournalsComp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isLoadingJournals: true,
      isLoadingLevel: true,
      journals: null,
      level: null,
    };
  }
  componentDidMount() {
    firebase
      .database()
      .ref(`/users/${firebase.auth().currentUser.uid}/level`)
      .on(
        "value",
        (snap) => this.setState({ isLoadingLevel: false, level: snap.val() }),
        (err) => {
          message.error("Uh oh, we could not access your journals.");
        }
      );
    firebase
      .database()
      .ref(`/entries/${firebase.auth().currentUser.uid}/`)
      .on(
        "value",
        (snap) => {
          this.setState({
            journals: snap.val(),
            isLoadingJournals: false,
          });
        },
        (err) => {
          message.error("Uh oh, we could not access your journals.");
        }
      );
  }

  render() {
    const {
      isLoadingJournals,
      isLoadingLevel,

      journals,
      level,
    } = this.state;
    if (isLoadingJournals) {
      return <FullScreenSpin />;
    }
    const journalEntries = Object.entries(journals || {});
    if (journalEntries.length === 0) {
      return (
        <div className="Empty-journals-container">
          <div className="Empty-journals">
            <h2 className="Empty-journals-title">
              You don't have any journals yet
            </h2>
            <p className="Empty-journals-desc">
              Journal Buddy should send you an email asking about your day soon.
              Once you answer, those entries will show up here. Check back soon!
              😊
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="Journal-entries-container">
        {journalEntries
          .sort(([ka, _a], [kb, _b]) => +kb - +ka)
          .map(([k, j]) => {
            return (
              <div className="Journal-entry-container" key={k}>
                <div className="Journal-entry-header">
                  <h3 className="Journal-entry-header-title">
                    {new Date(j["date"]).toLocaleString("en-US", {
                      weekday: "short",
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                    })}
                  </h3>
                  <Button
                    className="Journal-entry-header-btn"
                    type="default"
                    onClick={(e) => {
                      Modal.confirm({
                        icon: <ExclamationCircleOutlined />,
                        title: "Are you absolutely sure?",
                        content: (
                          <p>
                            You're about to delete your journal entry. This
                            can't be undone.
                          </p>
                        ),
                        okText: "Yes, delete this entry",
                        okType: "danger",
                        onOk() {
                          firebase
                            .database()
                            .ref(
                              `/entries/${firebase.auth().currentUser.uid}/${k}`
                            )
                            .set(null)
                            .catch((e) => {
                              message.error(
                                "Uh oh, failed to delete your entry. Please try again"
                              );
                            });
                        },
                      });
                    }}
                  >
                    Delete this entry
                  </Button>
                </div>
                <div className="Journal-entry-content-container">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: marked(j["stripped-text"]),
                    }}
                  ></div>
                </div>
              </div>
            );
          })}
        {!isLoadingLevel && level !== "premium" ? (
          <div className="Journal-upsell-container">
            <h1 className="Journal-upsell-title">
              Would you like to be a patron of Journal Together?
            </h1>
            <p className="Journal-upsell-content">
              If Journal Together has been useful to you, consider upgrading to
              🏅Premium. Your support goes a long way.
            </p>
            <Button
              className="Journal-upsell-btn"
              type="primary"
              onClick={(e) => {
                this.props.history.push("/me/account");
              }}
            >
              Learn more
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
}

const Journals = withRouter(JournalsComp);

class AccountComp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isLoading: true,
      isUpgrading: false,
      level: null,
    };
  }
  componentDidMount() {
    firebase
      .database()
      .ref(`/users/${firebase.auth().currentUser.uid}/level`)
      .on(
        "value",
        (snap) => this.setState({ isLoading: false, level: snap.val() }),
        (err) => {
          message.error(
            "Uh no, failed to fetch your data. Sorry about that :("
          );
        }
      );
  }
  render() {
    const { isLoading, isUpgrading, level } = this.state;
    if (isLoading) {
      return <FullScreenSpin />;
    }
    return (
      <div className="Account-container">
        <div className="Account-membership-container">
          <h2 className="Account-membershup-title">
            Membership:{" "}
            {level === "premium" ? (
              <span className="Account-membershup-title-premium">
                🏅 Premium
              </span>
            ) : (
              <span className="Account-membershup-title-standard">
                Standard
              </span>
            )}
          </h2>
          <div className="Account-membership-content-container">
            {level === "premium" ? (
              <div className="Account-membership-content">
                <p className="Account-memberip-content">
                  Thank you for supporting us. I appreciate your patronage 😊
                </p>
                <p className="Account-memberip-content">
                  If time has comes to move on from Journal Together though, I
                  completely understand. If you'd like to cancel your
                  subscription, here's a handy button to do that
                </p>
                <Button
                  size="large"
                  type="default"
                  onClick={(e) => {
                    Modal.confirm({
                      icon: <ExclamationCircleOutlined />,
                      title: "Are you absolutely sure?",
                      content: (
                        <p>
                          You're about to cancel your subscription. Changes will
                          take place immediately
                        </p>
                      ),
                      okText: "Yes, cancel my subscription",
                      okType: "danger",
                      onOk() {
                        firebase
                          .auth()
                          .currentUser.getIdToken()
                          .then((token) => {
                            return fetch(
                              serverPath("api/me/checkout/cancel-subscription"),
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  token: token,
                                },
                              }
                            );
                          })
                          .then((x) => {
                            return x.status === 200
                              ? x.json()
                              : Promise.reject(x.json());
                          })
                          .catch((e) => {
                            message.error(
                              "Oh no, something broke. We'll be on this as fast as possible. Please try again"
                            );
                          });
                      },
                    });
                  }}
                >
                  Cancel my subscription
                </Button>
              </div>
            ) : (
              <div className="Account-membershop-content-container">
                <div className="Account-membership-content">
                  <p className="Account-memberip-content">
                    Thank you for using Journal Together. How has your
                    experience been? If you've liked it, want to support the
                    product, consider upgrading to 🏅Premium.
                  </p>
                </div>
                <Button
                  className="Account-upgrade-btn"
                  type="primary"
                  loading={isUpgrading}
                  onClick={() => {
                    this.setState({ isUpgrading: true });
                    const sessionPromise = firebase
                      .auth()
                      .currentUser.getIdToken()
                      .then((token) => {
                        return fetch(
                          serverPath("api/me/checkout/create-session"),
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              token: token,
                            },
                          }
                        );
                      })
                      .then((x) => {
                        return x.status === 200
                          ? x.json()
                          : Promise.reject(x.json());
                      });
                    Promise.all([stripePromise, sessionPromise]).then(
                      ([stripe, session]) => {
                        this.setState({ isUpgrading: false });
                        stripe.redirectToCheckout({
                          sessionId: session["id"],
                        });
                      },
                      (e) => {
                        message.error(
                          "Uh oh, I couldn't upgrade you. Sorry about this, we'll get on it asap"
                        );
                        this.setState({
                          isUpgrading: false,
                        });
                      }
                    );
                  }}
                >
                  Upgrade to 🏅 Premium
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="Account-delete-container">
          <h2 className="Account-delete-title">Sign out</h2>
          <p className="Account-delete-content">
            Want to sign out? Sure thing. Click this handy link to sign out
          </p>
          <Button
            size="large"
            type="default"
            onClick={(e) => {
              firebase.auth().signOut();
            }}
          >
            Sign out
          </Button>
        </div>
        <div className="Account-delete-container">
          <h2 className="Account-delete-title">Delete your account</h2>
          <p className="Account-delete-content">
            If time has come to delete your account, I understand. Thank you for
            giving us a shot.
          </p>
          <Button
            size="large"
            type="default"
            onClick={(e) => {
              Modal.confirm({
                icon: <ExclamationCircleOutlined />,
                title: "Are you absolutely sure?",
                content: (
                  <p>
                    You're about to delete your account. This will purge all
                    your data, and cannot be undone.
                  </p>
                ),
                okText: "Yes, delete my account",
                okType: "danger",
                onOk() {
                  return firebase
                    .auth()
                    .currentUser.getIdToken()
                    .then((token) => {
                      return fetch(serverPath("api/me/delete-account"), {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          token: token,
                        },
                      });
                    })
                    .then((x) => {
                      firebase.auth().signOut();
                      message.info(
                        "Your account has been deleted. Thank you for giving us a shot"
                      );
                      return x.status === 200
                        ? x.json()
                        : Promise.reject(x.json());
                    });
                },
              });
            }}
          >
            Delete my account
          </Button>
        </div>
      </div>
    );
  }
}

const Account = withRouter(AccountComp);

class MeComp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isLoading: true,
      isLoggedIn: null,
    };
  }

  componentDidMount() {
    const queryParams = qs.parse(this.props.location.search, {
      ignoreQueryPrefix: true,
    });
    if (queryParams.success) {
      message.success(
        "Welcome to Journal Together premium! We are happy to have you"
      );
    }
    window.signOut = () => firebase.auth().signOut();
    firebase.auth().onAuthStateChanged((user) => {
      this.setState({
        isLoading: false,
        isLoggedIn: user,
      });
    });
  }

  render() {
    const { isLoading, isLoggedIn } = this.state;
    if (isLoading) {
      return <FullScreenSpin />;
    }
    if (!isLoggedIn || !firebase.auth().currentUser) {
      return <SignIn />;
    }
    return (
      <div className="Me-container">
        <div className="Me-header">
          <h2 className="Me-header-logo">
            <NavLink className="Me-header-logo-link" to="/me">
              📝 <span className="Me-header-logo-name">journaltogether</span>
            </NavLink>
          </h2>
          <div className="Me-header-menu-container">
            <NavLink exact className="Me-header-menu-item" to="/me">
              Home
            </NavLink>
            <NavLink className="Me-header-menu-item" to="/me/journals">
              Journals
            </NavLink>
            <NavLink className="Me-header-menu-item" to="/me/account">
              Account
            </NavLink>
            <a
              className="Me-header-menu-item"
              href="mailto:stepan.p@gmail.com"
              target="_blank"
            >
              Contact us
            </a>
          </div>
        </div>
        <Switch>
          <Route path="/me/journals">
            <Journals />
          </Route>
          <Route path="/me/account">
            <Account />
          </Route>
          <Route path="/me">
            <ProfileHome />
          </Route>
        </Switch>
      </div>
    );
  }
}

const Me = withRouter(MeComp);

class MagicAuthComp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isLoading: true,
      errorMessage: null,
    };
  }

  componentDidMount() {
    const { code } = this.props.match.params;
    fetch(serverPath("api/magic/auth"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((x) => (x.status === 200 ? x.json() : Promise.reject("uh oh")))
      .then(({ token }) => firebase.auth().signInWithCustomToken(token))
      .then(
        () => {
          this.props.history.push("/me");
        },
        () => {
          this.props.history.push("/me");
          message.error(
            "This magic link did not seem to work. Please try again"
          );
        }
      );
  }

  render() {
    const { isLoading, errorMessage } = this.state;
    if (isLoading) {
      return <FullScreenSpin message="Signing in..." />;
    }
    return null;
  }
}

const MagicAuth = withRouter(MagicAuthComp);

function HomeComp({ history }) {
  return (
    <div className="Home">
      <div className="Home-menu">
        <div className="Home-menu-item-container">
          <a
            className="Home-menu-item"
            href="mailto:stepan.p@gmail.com"
            target="_blank"
          >
            Contact us
          </a>
          <Link className="Home-menu-item" to="/me">
            Sign in
          </Link>
        </div>
      </div>
      <div className="Home-hero">
        <div className="Home-hero-header">
          <h1 className="Home-hero-title">📝 journaltogether</h1>
          <h2 className="Home-hero-sub">
            Keep track of your days and connect with your friends
          </h2>
        </div>
        <div className="Home-hero-content">
          <p>
            Journal and keep tabs with your friends all over email. At the end
            of every day, you'll receive an email from Journal Together. The
            very next day, you'll receive a group email with your friends, with
            what everyone wrote. It's as simple as that
          </p>
        </div>
      </div>
      <div className="Home-steps-container">
        <div className="Home-step">
          <div className="Home-step-image-container">
            <img className="Home-step-image" src={inviteFriendsImg} />
          </div>
          <div className="Home-step-info">
            <h3 className="Home-step-title">Choose your friends</h3>
            <p>
              Who do you want to share a slice of life with? Sign up and pick
              your friends
            </p>
          </div>
        </div>
        <div className="Home-step">
          <div className="Home-step-image-container">
            <img className="Home-step-image" src={howWasYourDayImg} />
          </div>
          <div className="Home-step-info">
            <h3 className="Home-step-title">Journal over email</h3>
            <p>
              How did your day go? Journal Together will email you at the end of
              every day. Jot it down in any way you like.
            </p>
          </div>
        </div>
        <div className="Home-step">
          <div className="Home-step-image-container">
            <img className="Home-step-image" src={summaryImg} />
          </div>
          <div className="Home-step-info">
            <h3 className="Home-step-title">See how your friends are doing</h3>
            <p>
              At the beginning of the next day, you'll receive a group email
              with what all your friends wrote. Experience eachother's slice of
              life no matter where in the world you are.
            </p>
          </div>
        </div>
      </div>
      <div className="Home-faq-container">
        <div className="Home-faq-header">
          <h2 className="Home-faq-title">Frequently Asked Questions</h2>
        </div>
        <div className="Home-faq-section">
          <h3>Q: How much does this cost?</h3>
          <p>
            <strong>All features of Journal Together are free.</strong> If you
            would like to support the service though, there is a premium
            membership at $10 / month. It's main purpose is for patronage:
            you'll have the same features, but you'll see a nice 🏅tag on your
            account, and I'll be grateful to ya : )
          </p>
        </div>
        <div className="Home-faq-section">
          <h3>Q: Can I just use this for myself?</h3>
          <p>
            Absolutely. If you don't create any groups, you'll still be able to
            log and view your journals.
          </p>
        </div>
        <div className="Home-faq-section">
          <h3>Q: What will you do with my data?</h3>
          <p>
            These are your journal entries. I respect the heck out of that. I
            won't use or sell your data. If you report a bug, I may have to go
            through it. Whenever I do, I'll let you know. I'll put my{" "}
            <a
              href="https://www.linkedin.com/in/stepan-parunashvili-65698932/"
              target="_blank"
            >
              name
            </a>{" "}
            behind that.
          </p>
        </div>
      </div>
      <div className="Home-action-container">
        <div className="Home-action-header">
          <h2 className="Home-action-title">Yes, it is that easy</h2>
        </div>
        <p className="Home-action-sub">
          That's right. It's as simple as that. Ready to give it a whirl?
        </p>
        <Button
          className="Home-btn"
          type="primary"
          onClick={() => {
            history.push("/me");
          }}
        >
          Sign up free
        </Button>
      </div>
    </div>
  );
}

const Home = withRouter(HomeComp);

class App extends React.Component {
  render() {
    return (
      <div className="App">
        <Router>
          <Switch>
            <Route path="/me">
              <Me />
            </Route>
            <Route path="/magic/:code">
              <MagicAuth />
            </Route>
            <Route path="/">
              <Home />
            </Route>
          </Switch>
        </Router>
      </div>
    );
  }
}

export default App;
